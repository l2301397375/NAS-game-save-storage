console.log('[NEXUS] app.js loaded');

var G=[], C=[], curGid=null, curCatId=null, scrapeTimer=null;

document.addEventListener('DOMContentLoaded', function(){ LA(); });

async function LA(){
  await Promise.all([lC(), lG(), lSt()]);   // 先并行加载这三个
  await lR();                               // 最后加载最近游戏（依赖 G）
}

// ===== 封面加载失败时的回退 =====
function onCoverError(img, icon) {
  img.onerror = null;
  var div = document.createElement('div');
  div.className = 'cd-nc';
  div.textContent = icon || '🕹️';
  if (img.parentNode) {
    img.parentNode.replaceChild(div, img);
  }
}

// ===== 视图切换 =====
function sv(n, b){
  document.querySelectorAll('.vw').forEach(function(v){ v.classList.remove('on'); });
  document.querySelectorAll('.ni').forEach(function(x){ x.classList.remove('on'); });
  document.getElementById('v-'+n).classList.add('on');
  if(b) b.classList.add('on');
  if(n==='dashboard'){ lSt(); lR(); }
  if(n==='games'){ lG(); }
  if(n==='categories'){ lC(); }
}

// 从游戏卡片进入存档页
function fBG(gid){
  curGid = gid;
  var g = null;
  for(var i=0;i<G.length;i++){ if(G[i].id===gid){ g=G[i]; break; } }
  if(g){
    document.getElementById('gsTitle').innerHTML = '&#11074; ' + g.icon + ' ' + g.name + ' 的存档';
  }
  document.querySelectorAll('.vw').forEach(function(v){ v.classList.remove('on'); });
  document.querySelectorAll('.ni').forEach(function(x){ x.classList.remove('on'); });
  var gameBtn = document.querySelector('[data-v="games"]');
  if(gameBtn) gameBtn.classList.add('on');
  document.getElementById('v-gamesaves').classList.add('on');
  lGS(gid);
}

// 返回游戏库
function backToGames(){
  curGid = null;
  sv('games', document.querySelector('[data-v="games"]'));
}

// ===== 分类 =====
async function lC(){
  var r = await fetch('/api/categories');
  C = await r.json();
  rC(); uCS(); renderNavCats();
}

function rC(){
  var e = document.getElementById('cl');
  if(!C.length){ e.innerHTML='<div class="em"><span>&#11042;</span>暂无分类</div>'; return; }
  e.innerHTML = C.map(function(c){
    return '<div class="cd" style="border-left:3px solid '+c.color+'">'
      +'<div class="cd-t">'+c.icon+' '+c.name+'</div>'
      +'<div class="cd-s">'+(c.description||'—')+'</div>'
      +'<div class="cd-a"><button class="bt bs br" onclick="dC('+c.id+')">&#10005; 删除</button></div></div>';
  }).join('');
}
function uCS(){
  var o = C.map(function(c){ return '<option value="'+c.id+'">'+c.icon+' '+c.name+'</option>'; }).join('');
  document.getElementById('gc').innerHTML = '<option value="">未分类</option>'+o;
}
function oCM(){ document.getElementById('catModal').classList.remove('hid'); }
async function doCC(){
  var n=document.getElementById('cn').value.trim();
  if(!n) return tt('请输入名称',1);
  var r=await fetch('/api/categories',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:n,icon:document.getElementById('ci2').value||'🎮',color:document.getElementById('cc').value})});
  var d=await r.json(); tt(d.message,!d.success);
  if(d.success){cm('catModal');lC();}
}
async function dC(id){
  if(!confirm('确定删除?'))return;
  await fetch('/api/categories/'+id,{method:'DELETE'});
  tt('已删除');lC();
}

// ===== 游戏 =====
async function lG(){
  var r=await fetch('/api/games'); G=await r.json();
  rG(); uGS(); renderNavCats();
}

async function rG(){
  var e=document.getElementById('gl');
  if(!G.length){ e.innerHTML='<div class="em"><span>&#9673;</span>暂无游戏</div>'; return; }
  var sr=await fetch('/api/saves'); var as=await sr.json();
  e.innerHTML=G.map(function(g){
    var cnt=0; for(var i=0;i<as.length;i++){if(as[i].game_id===g.id)cnt++;}
    var hasCover=g.cover_url && g.cover_url.length>0;
    var coverHtml;
    if(hasCover){
      var iconSafe = (g.icon||'🕹️').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      var imgSrc = '/api/scrape/image?url=' + encodeURIComponent(g.cover_url);
      coverHtml = '<div class="cd-cv-wrap">'
        + '<img class="cd-cv-bg" src="'+imgSrc+'" aria-hidden="true">'
        + '<img class="cd-cv" src="'+imgSrc+'" '
        + 'onerror="onCoverError(this, \'' + iconSafe + '\')">'
        + '</div>';
    } else {
      coverHtml = '<div class="cd-nc">' + (g.icon||'🕹️') + '</div>';
    }
      var titleHtml = hasCover
        ? '<div class="cd-t">' + g.name + '</div>'
        : '<div class="cd-t">' + (g.icon||'🕹️') + ' ' + g.name + '</div>';
    // ★ 分类标签
      var catTag = '';
    if(g.category_id){
      var cat = null;
      for(var k=0;k<C.length;k++){ if(C[k].id === g.category_id){ cat = C[k]; break; } }
      if(cat){
        catTag = '<div class="cd-cat-tag" style="background:'+cat.color+'cc">'
          + cat.icon + ' ' + cat.name
          + '</div>';
      }
    }
    return '<div class="cd">' + catTag + coverHtml + titleHtml
      + '<div class="cd-s">' + (g.category_name || '未分类') + ' · ' + cnt + '个存档</div>'
      + '<div class="cd-a">'
      + '<button class="bt bs bg" onclick="fBG(' + g.id + ')">&#11074; 存档</button>'
      + '<button class="bt bs bp" onclick="openEditGame('+g.id+')" style="padding:7px 12px;font-size:12px">&#9998;</button>'
      + '<button class="bt bs br" onclick="dG(' + g.id + ')">&#10005;</button>'
      + '</div></div>';
  }).join('');
}
function uGS(){
  var o=G.map(function(g){return '<option value="'+g.id+'">'+(g.icon||'🕹️')+' '+g.name+'</option>';}).join('');
  document.getElementById('ug').innerHTML='<option value="">-- 选择 --</option>'+o;
}

// ★ 只定义一次 oGM（带实时预览）
function oGM(){
  document.getElementById('gn').value='';
  document.getElementById('gi').value='🎮';
  document.getElementById('gv').value='';
  document.getElementById('scR').innerHTML='';
  document.getElementById('scPreview').classList.add('hid');
  document.getElementById('gameModal').classList.remove('hid');
  // 给封面URL输入框加实时预览
  var gv = document.getElementById('gv');
  gv.oninput = function() {
    var url = this.value.trim();
    var prev = document.getElementById('scPreview');
    var prevImg = document.getElementById('scPrevImg');
    if (url) {
      prevImg.src = url.startsWith('/') || url.startsWith('http')
        ? url
        : '/api/scrape/image?url=' + encodeURIComponent(url);
      prev.classList.remove('hid');
      prevImg.onerror = function() {
        tt('图片加载失败，请检查 URL', 1);
      };
    } else {
      prev.classList.add('hid');
    }
  };
}

async function doCG(){
  var n=document.getElementById('gn').value.trim();
  if(!n)return tt('请输入游戏名',1);
  var r=await fetch('/api/games',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:n,category_id:document.getElementById('gc').value||null,
      icon:document.getElementById('gi').value||'🎮',
      cover_url:document.getElementById('gv').value||''})});
  var d=await r.json();
  tt(d.success?'添加成功':d.message,!d.success);
  if(d.success){cm('gameModal');lG();}
}
async function dG(id){
  if(!confirm('删除游戏及其所有存档?'))return;
  await fetch('/api/games/'+id,{method:'DELETE'});
  tt('已删除');lG();lSt();
}

// ===== 自动刮削（输入时自动搜索） =====
function autoScrape(val){
  clearTimeout(scrapeTimer);
  var v=val.trim();
  if(v.length<2){
    document.getElementById('scR').innerHTML='';
    document.getElementById('scL').classList.add('hid');
    document.getElementById('scPreview').classList.add('hid');
    return;
  }
  scrapeTimer=setTimeout(function(){ doScrape(v); }, 800);
}

function manualScrape(){
  var v=document.getElementById('gn').value.trim();
  if(!v)return tt('先输入游戏名',1);
  doScrape(v);
}

// ★ 并行查 Steam + IGDB
async function doScrape(name){
  var ld=document.getElementById('scL'), rs=document.getElementById('scR');
  ld.classList.remove('hid'); rs.innerHTML='';
  try {
    var results = await Promise.all([
      fetch('/api/scrape?name='+encodeURIComponent(name)).then(function(r){return r.json();}).catch(function(){return [];}),
      fetch('/api/scrape/igdb?name='+encodeURIComponent(name)).then(function(r){return r.json();}).catch(function(){return [];}),
    ]);
    var steamRes = results[0] || [];
    var igdbRes = results[1] || [];
    // 合并 + 去重（同名只保留第一条）
    var all = [];
    var seen = {};
    var combined = steamRes.concat(igdbRes);
    for (var i=0; i<combined.length; i++) {
      var item = combined[i];
      var k = (item.name||'').toLowerCase();
      if (seen[k]) continue;
      seen[k] = 1;
      all.push(item);
    }
    ld.classList.add('hid');
    if (!all.length) {
      rs.innerHTML='<div class="cd-s" style="padding:12px;text-align:center">'
        +'未找到结果<br>'
        +'<span style="font-size:11px;opacity:.7">提示：IGDB 对中文支持弱，试试英文名（如 "zelda"）</span>'
        +'</div>';
      return;
    }
    rs.innerHTML = all.map(function(item, idx){
      var imgSafe = (item.image||'').replace(/"/g,'&quot;');
      var nameSafe = (item.name||'').replace(/"/g,'&quot;');
      var badge;
      if (item.source === 'igdb') {
        badge = '<span style="font-size:9px;color:#a29bfe">IGDB</span> ';
      } else {
        badge = '<span style="font-size:9px;color:#0984e3">STEAM</span> ';
      }
      return '<div class="si'+(idx===0?' sel':'')+'" data-img="'+imgSafe+'" data-name="'+nameSafe+'" onclick="selS(this)">'
        +'<img src="/api/scrape/image?url='+encodeURIComponent(item.image||'')+'" '
        +'onerror="this.onerror=null;this.parentElement.style.display=\'none\'">'
        +'<div class="nm">'+badge+(item.name||'')+'</div></div>';
    }).join('');
    var first=rs.querySelector('.si');
    if(first) selS(first);
  } catch(e) {
    ld.classList.add('hid');
    rs.innerHTML='<div class="cd-s" style="padding:12px">搜索失败</div>';
  }
}

function selS(el){
  document.querySelectorAll('.si').forEach(function(i){i.classList.remove('sel');});
  el.classList.add('sel');
  var imgUrl=el.getAttribute('data-img');
  var gameName=el.getAttribute('data-name');
  document.getElementById('gv').value=imgUrl;
  var prev=document.getElementById('scPreview');
  document.getElementById('scPrevImg').src='/api/scrape/image?url='+encodeURIComponent(imgUrl);
  prev.classList.remove('hid');
  if(!document.getElementById('gn').value.trim()){
    document.getElementById('gn').value=gameName;
  }
  tt('✓ 已选择: '+gameName);
}

// ===== 某游戏的存档 =====
async function lGS(gid){
  var r=await fetch('/api/saves?game_id='+gid);
  var s=await r.json();
  rSv(s,'gsl');
}

// ===== 最近存档（仪表盘） =====
// ===== 最近存档（仪表盘）：显示游戏卡片 =====
async function lR(){
  var e = document.getElementById('rs');
  if(!G.length){
    e.innerHTML = '<div class="em"><span>&#9673;</span>暂无游戏</div>';
    return;
  }
  // 复用游戏库的渲染逻辑，但只显示最近添加的 6 个游戏
  var recent = G.slice(0, 4);
  var sr = await fetch('/api/saves');
  var as = await sr.json();
  e.innerHTML = recent.map(function(g){
    var cnt = 0;
    for(var i=0;i<as.length;i++){ if(as[i].game_id===g.id) cnt++; }
    var hasCover = g.cover_url && g.cover_url.length>0;
    var coverHtml;
    if(hasCover){
      var iconSafe = (g.icon||'🕹️').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      var imgSrc = '/api/scrape/image?url=' + encodeURIComponent(g.cover_url);
      coverHtml = '<div class="cd-cv-wrap">'
        + '<img class="cd-cv-bg" src="'+imgSrc+'" aria-hidden="true">'
        + '<img class="cd-cv" src="'+imgSrc+'" '
        + 'onerror="onCoverError(this, \'' + iconSafe + '\')">'
        + '</div>';
    } else {
      coverHtml = '<div class="cd-nc">' + (g.icon||'🕹️') + '</div>';
    }
      var titleHtml = hasCover
        ? '<div class="cd-t">' + g.name + '</div>'
        : '<div class="cd-t">' + (g.icon||'🕹️') + ' ' + g.name + '</div>';
    // ★ 分类标签
      var catTag = '';
    if(g.category_id){
      var cat = null;
      for(var k=0;k<C.length;k++){ if(C[k].id === g.category_id){ cat = C[k]; break; } }
      if(cat){
        catTag = '<div class="cd-cat-tag" style="background:'+cat.color+'cc">'
          + cat.icon + ' ' + cat.name
          + '</div>';
      }
    }
    return '<div class="cd">' + catTag + coverHtml + titleHtml
      + '<div class="cd-s">' + (g.category_name || '未分类') + ' · ' + cnt + '个存档</div>'
      + '<div class="cd-a">'
      + '<button class="bt bs bg" onclick="fBG(' + g.id + ')">&#11074; 存档</button>'
      + '<button class="bt bs bp" onclick="openEditGame('+g.id+')" style="padding:7px 12px;font-size:12px">&#9998;</button>'
      + '<button class="bt bs br" onclick="dG(' + g.id + ')">&#10005;</button>'
      + '</div></div>';
  }).join('');
}

function rSv(list,eid){
  var e=document.getElementById(eid);
  if(!list.length){e.innerHTML='<div class="em"><span>&#11074;</span>暂无存档</div>';return;}
  e.innerHTML=list.map(function(s){
    return '<div class="cd">'
      +'<div class="cd-t">&#11074; '+s.slot_name+' <small style="color:var(--dm);font-size:11px">v'+s.version+'</small></div>'
      +'<div class="cd-s">&#9673; '+s.game_name+'</div>'
      +'<div class="cd-s">📄 '+s.file_name+' ('+fSz(s.file_size)+')</div>'
      +(s.note?'<div class="cd-s">📝 '+s.note+'</div>':'')
      +'<div class="cd-s" style="opacity:.6">🕐 '+s.updated_at+'</div>'
      +'<div class="cd-a">'
      +'<button class="bt bs bg" onclick="location.href=\'/api/saves/'+s.id+'/download\'">&#11015; 下载</button>'
      +'<button class="bt bs br" onclick="dSv('+s.id+')">&#10005; 删除</button>'
      +'</div></div>';
  }).join('');
}

// ===== 上传 =====
function openUp(){
  document.getElementById('us').value='';
  document.getElementById('un').value='';
  document.getElementById('fi2').value='';
  document.getElementById('finf').innerHTML='';
  uGS();
  if(curGid){
    setTimeout(function(){document.getElementById('ug').value=curGid;},50);
  }
  document.getElementById('uploadModal').classList.remove('hid');
}
document.addEventListener('change',function(e){
  if(e.target.id==='fi2'){
    var f=e.target.files[0];
    document.getElementById('finf').innerHTML=f
      ?'<div class="cd-s" style="margin-top:8px;color:var(--ac)">📄 '+f.name+' ('+fSz(f.size)+')</div>':'';
  }
});

var uploadXhr = null;   // 全局变量，跟踪当前上传

function doUp(){
  var gid=document.getElementById('ug').value;
  var slot=document.getElementById('us').value.trim();
  var file=document.getElementById('fi2').files[0];
  if(!gid)return tt('请选择游戏',1);
  if(!slot)return tt('请输入槽位名',1);
  if(!file)return tt('请选择文件',1);

  // 显示进度条
  var progWrap = document.getElementById('upProgress');
  var progBar = document.getElementById('upProgressBar');
  var progText = document.getElementById('upProgressText');
  progWrap.classList.remove('hid');
  progBar.style.width = '0%';
  progText.textContent = '准备上传...';

  // 锁定界面
  lockUI();

  var fd = new FormData();
  fd.append('file',file);
  fd.append('game_id',gid);
  fd.append('slot_name',slot);
  fd.append('note',document.getElementById('un').value);

  uploadXhr = new XMLHttpRequest();
  uploadXhr.open('POST', '/api/saves/upload', true);

  uploadXhr.upload.onprogress = function(e){
    if(e.lengthComputable){
      var pct = Math.round(e.loaded / e.total * 100);
      progBar.style.width = pct + '%';
      progText.textContent = '上传中 ' + pct + '% ('
        + fSz(e.loaded) + ' / ' + fSz(e.total) + ')';
    }
  };

  uploadXhr.upload.onload = function(){
    progBar.style.width = '100%';
    progText.textContent = '上传完成，服务器保存中...';
  };

  uploadXhr.onload = function(){
  unlockUI();
  progWrap.classList.add('hid');
  uploadXhr = null; 
  try{
    var d = JSON.parse(this.responseText);
    tt(d.message,!d.success);
    if(d.success){
      cm('uploadModal', true);   // ★ 强制关闭
      if(curGid) lGS(curGid);
      lSt();lG();lR();
    }
  }catch(e){
    tt('保存失败: HTTP '+this.status,1);
  }
};

  uploadXhr.onerror = function(){
    if (uploadXhr === null) return; // 已被取消
    unlockUI();
    progWrap.classList.add('hid');
    uploadXhr = null;
    tt('上传失败：网络错误',1);
  };

  uploadXhr.onabort = function(){
    unlockUI();
    progWrap.classList.add('hid');
    uploadXhr = null;
    tt('已取消上传',1);
  };

  uploadXhr.send(fd);
}

// ===== 锁定/解锁界面 =====
function lockUI(){
  // 1. 弹窗内所有输入禁用
  document.querySelectorAll('#uploadModal input, #uploadModal select, #uploadModal .dz').forEach(function(el){
    el.style.pointerEvents = 'none';
    el.style.opacity = '0.4';
  });
  // 2. 保存按钮变成"取消上传"
    var upBtn = document.getElementById('upBtn');
  if(upBtn){
    upBtn.textContent = '✕ 取消上传';
    upBtn.classList.remove('bp');
    upBtn.classList.add('br');
    upBtn.onclick = cancelUpload;    // 换成取消函数
  }
}

function unlockUI(){
  document.querySelectorAll('#uploadModal input, #uploadModal select, #uploadModal .dz').forEach(function(el){
    el.style.pointerEvents = '';
    el.style.opacity = '';
  });
    var upBtn = document.getElementById('upBtn');
  if(upBtn){
    upBtn.textContent = '💾 保存';
    upBtn.classList.remove('br');
    upBtn.classList.add('bp');
    upBtn.onclick = doUp;            // 恢复
  }
}

// ===== 取消上传 =====
function cancelUpload(){
  if(uploadXhr){
    uploadXhr.abort();    // 中断连接
    // uploadXhr.onabort 会自动触发，处理 UI 恢复
  }
}

async function dSv(id){
  if(!confirm('确定删除?'))return;
  await fetch('/api/saves/'+id,{method:'DELETE'});
  tt('已删除');
  if(curGid) lGS(curGid);
  lSt();lG();lR();
}

// ===== 搜索 =====
var sT;
function doS(q){
  clearTimeout(sT);
  if(!q.trim()){sv('dashboard',document.querySelector('[data-v="dashboard"]'));return;}
  sT=setTimeout(async function(){
    var r=await fetch('/api/search?q='+encodeURIComponent(q));
    var res=await r.json();
    document.querySelectorAll('.vw').forEach(function(v){v.classList.remove('on');});
    document.querySelectorAll('.ni').forEach(function(x){x.classList.remove('on');});
    document.getElementById('v-search').classList.add('on');
    rSv(res,'sr2');
  },300);
}

// ===== 统计 =====
async function lSt(){
  var r=await fetch('/api/stats');var s=await r.json();
  document.getElementById('sg2').innerHTML=
    '<div class="st"><div class="v">'+s.categories+'</div><div class="l">&#11042; 分类</div></div>'
    +'<div class="st"><div class="v">'+s.games+'</div><div class="l">&#9673; 游戏</div></div>'
    +'<div class="st"><div class="v">'+s.saves+'</div><div class="l">&#11074; 存档</div></div>'
    +'<div class="st"><div class="v">'+fSz(s.total_size)+'</div><div class="l">&#9672; 容量</div></div>';
}

function fSz(b){
  if(!b)return'0 B';var k=1024,s=['B','KB','MB','GB'],i=Math.floor(Math.log(b)/Math.log(k));
  return(b/Math.pow(k,i)).toFixed(1)+' '+s[i];
}

function cm(id, force){
  if(!force && id === 'uploadModal' && uploadXhr) return;
  document.getElementById(id).classList.add('hid');
}

function tt(m,e){
  var t=document.getElementById('toast');t.textContent=m;
  t.className='tt'+(e?' err':'');
  setTimeout(function(){t.classList.add('hid');},3000);
}

// ===== 编辑游戏 =====
var editGid = null;

function openEditGame(gid){
  editGid = gid;
  var g = null;
  for(var i=0;i<G.length;i++){ if(G[i].id===gid){ g=G[i]; break; } }
  if(!g) return;
  document.getElementById('eg-name').value = g.name || '';
  document.getElementById('eg-icon').value = g.icon || '🕹️';
  document.getElementById('eg-cover').value = g.cover_url || '';
  // 填充分类下拉
  var catHtml = '<option value="">未分类</option>';
  for(var j=0;j<C.length;j++){
    var sel = (C[j].id === g.category_id) ? ' selected' : '';
    catHtml += '<option value="'+C[j].id+'"'+sel+'>'+C[j].icon+' '+C[j].name+'</option>';
  }
  document.getElementById('eg-cat').innerHTML = catHtml;
  // 封面预览
  var prev = document.getElementById('eg-preview');
  var prevImg = document.getElementById('eg-preview-img');
  if(g.cover_url){
    prevImg.src = '/api/scrape/image?url=' + encodeURIComponent(g.cover_url);
    prev.classList.remove('hid');
  } else {
    prev.classList.add('hid');
  }
  // 输入封面URL时实时预览
  document.getElementById('eg-cover').oninput = function(){
    var url = this.value.trim();
    if(url){
      prevImg.src = '/api/scrape/image?url=' + encodeURIComponent(url);
      prev.classList.remove('hid');
    } else {
      prev.classList.add('hid');
    }
  };
  document.getElementById('editModal').classList.remove('hid');
}

async function doEditGame(){
  if(!editGid) return;
  var name = document.getElementById('eg-name').value.trim();
  if(!name) return tt('游戏名不能为空', 1);
  var payload = {
    name: name,
    category_id: document.getElementById('eg-cat').value || null,
    icon: document.getElementById('eg-icon').value || '🕹️',
    cover_url: document.getElementById('eg-cover').value || ''
  };
  var r = await fetch('/api/games/'+editGid, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload)
  });
  var d = await r.json();
  tt(d.message || (d.success?'保存成功':'保存失败'), !d.success);
  if(d.success){
    cm('editModal');
    lG();
    lR();
  }
}

// ===== 侧边栏分类列表 =====
function renderNavCats(){
  var e = document.getElementById('navCats');
  if(!e) return;
  if(!C.length){
    e.innerHTML = '<div class="nav-cat-title">分类</div>'
      + '<div style="padding:8px 16px;font-size:11px;color:var(--dm)">暂无分类</div>';
    return;
  }
  e.innerHTML = '<div class="nav-cat-title">分类</div>' + C.map(function(c){
    var cnt = 0;
    for(var i=0;i<G.length;i++){ if(G[i].category_id === c.id) cnt++; }
    var on = (curCatId === c.id) ? ' on' : '';
    return '<button class="nav-cat'+on+'" onclick="openCat('+c.id+')">'
      + '<span class="cc-icon">'+c.icon+'</span>'
      + '<span class="cc-name">'+c.name+'</span>'
      + '<span class="cc-cnt">'+cnt+'</span>'
      + '</button>';
  }).join('');
}

// ===== 进入某个分类 =====
function openCat(cid){
  curCatId = cid;
  var c = null;
  for(var i=0;i<C.length;i++){ if(C[i].id===cid){ c=C[i]; break; } }
  if(c){
    document.getElementById('cgTitle').innerHTML = '&#128193; ' + c.icon + ' ' + c.name + ' 的游戏';
  }
  // 切换到分类详情视图
  document.querySelectorAll('.vw').forEach(function(v){ v.classList.remove('on'); });
  document.querySelectorAll('.ni').forEach(function(x){ x.classList.remove('on'); });
  var catBtn = document.querySelector('[data-v="categories"]');
  if(catBtn) catBtn.classList.add('on');
  document.getElementById('v-catgames').classList.add('on');
  renderCatGames(cid);
  renderNavCats();   // 刷新侧边栏高亮
}

function renderCatGames(cid){
  var e = document.getElementById('cgl');
  if(!e) return;
  var list = G.filter(function(g){ return g.category_id === cid; });
  if(!list.length){
    e.innerHTML = '<div class="em"><span>&#9673;</span>该分类下暂无游戏</div>';
    return;
  }
  // 复用游戏卡片的渲染
  var sr = fetch('/api/saves').then(function(r){return r.json();}).catch(function(){return [];});
  sr.then(function(as){
    e.innerHTML = list.map(function(g){
      var cnt = 0;
      for(var i=0;i<as.length;i++){ if(as[i].game_id===g.id) cnt++; }
      var hasCover = g.cover_url && g.cover_url.length>0;
      var coverHtml;
      if(hasCover){
        var iconSafe = (g.icon||'🕹️').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        var imgSrc = '/api/scrape/image?url=' + encodeURIComponent(g.cover_url);
        coverHtml = '<div class="cd-cv-wrap">'
          + '<img class="cd-cv-bg" src="'+imgSrc+'" aria-hidden="true">'
          + '<img class="cd-cv" src="'+imgSrc+'" '
          + 'onerror="onCoverError(this, \'' + iconSafe + '\')">'
          + '</div>';
      } else {
        coverHtml = '<div class="cd-nc">' + (g.icon||'🕹️') + '</div>';
      }
      var titleHtml = hasCover
        ? '<div class="cd-t">' + g.name + '</div>'
        : '<div class="cd-t">' + (g.icon||'🕹️') + ' ' + g.name + '</div>';
      var catTag = '';
      if(g.category_id){
        var cat = null;
        for(var k=0;k<C.length;k++){ if(C[k].id === g.category_id){ cat = C[k]; break; } }
        if(cat){
          catTag = '<div class="cd-cat-tag" style="background:'+cat.color+'cc">'
            + cat.icon + ' ' + cat.name
            + '</div>';
        }
      }
      return '<div class="cd">' + catTag + coverHtml + titleHtml
        + '<div class="cd-s">' + (g.category_name || '未分类') + ' · ' + cnt + '个存档</div>'
        + '<div class="cd-a">'
        + '<button class="bt bs bg" onclick="fBG(' + g.id + ')">&#11074; 存档</button>'
        + '<button class="bt bs bp" onclick="openEditGame('+g.id+')" style="padding:7px 12px;font-size:12px">&#9998;</button>'
        + '<button class="bt bs br" onclick="dG(' + g.id + ')">&#10005;</button>'
        + '</div></div>';
    }).join('');
  });
}

function backToCats(){
  curCatId = null;
  sv('categories', document.querySelector('[data-v="categories"]'));
  renderNavCats();
}