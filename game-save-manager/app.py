from flask import Flask, request, jsonify, send_file, Response, render_template
from flask_cors import CORS
from werkzeug.utils import secure_filename
import os, uuid, sqlite3, time
import requests as http_requests

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 1 * 1024 * 1024 * 1024  # 1GB 上限
CORS(app)

# ==================== 配置 ====================
IGDB_CLIENT_ID = os.environ.get('IGDB_CLIENT_ID', '')
IGDB_CLIENT_SECRET = os.environ.get('IGDB_CLIENT_SECRET', '')
IGDB_PROXY = os.environ.get('IGDB_PROXY', 'https://chuangshi.eu.cc')  # ★ 新增：Worker 中转地址
_igdb_token_cache = {'token': None, 'expires': 0}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
SAVE_DIR = os.path.join(DATA_DIR, 'saves')
DB_PATH = os.path.join(DATA_DIR, 'saves.db')
os.makedirs(SAVE_DIR, exist_ok=True)

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            icon TEXT DEFAULT '🎮',
            color TEXT DEFAULT '#00b4ff',
            description TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category_id INTEGER,
            icon TEXT DEFAULT '🕹️',
            cover_url TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS saves (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id INTEGER NOT NULL,
            slot_name TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_size INTEGER DEFAULT 0,
            note TEXT DEFAULT '',
            version INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        );
    ''')
    conn.commit()
    conn.close()

init_db()

# ==================== API ====================

@app.route('/api/categories', methods=['GET'])
def api_get_cats():
    conn = get_db()
    rows = conn.execute('SELECT * FROM categories ORDER BY name').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/categories', methods=['POST'])
def api_create_cat():
    d = request.json
    name = d.get('name','').strip()
    if not name:
        return jsonify({'success':False,'message':'名称不能为空'}),400
    conn = get_db()
    try:
        conn.execute('INSERT INTO categories (name,icon,color,description) VALUES (?,?,?,?)',
                     (name, d.get('icon','🎮'), d.get('color','#00b4ff'), d.get('description','')))
        conn.commit()
        return jsonify({'success':True,'message':'创建成功'})
    except sqlite3.IntegrityError:
        return jsonify({'success':False,'message':'分类已存在'})
    finally:
        conn.close()

@app.route('/api/categories/<int:cid>', methods=['DELETE'])
def api_del_cat(cid):
    conn = get_db()
    conn.execute('UPDATE games SET category_id=NULL WHERE category_id=?',(cid,))
    conn.execute('DELETE FROM categories WHERE id=?',(cid,))
    conn.commit(); conn.close()
    return jsonify({'success':True})

@app.route('/api/games', methods=['GET'])
def api_get_games():
    cat_id = request.args.get('category_id', type=int)
    conn = get_db()
    if cat_id:
        rows = conn.execute(
            'SELECT g.*,c.name as category_name FROM games g LEFT JOIN categories c ON g.category_id=c.id WHERE g.category_id=? ORDER BY g.name',
            (cat_id,)).fetchall()
    else:
        rows = conn.execute(
            'SELECT g.*,c.name as category_name FROM games g LEFT JOIN categories c ON g.category_id=c.id ORDER BY g.name'
        ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/games', methods=['POST'])
def api_create_game():
    d = request.json
    name = d.get('name','').strip()
    if not name:
        return jsonify({'success':False,'message':'名称不能为空'}),400
    conn = get_db()
    conn.execute('INSERT INTO games (name,category_id,icon,cover_url) VALUES (?,?,?,?)',
                 (name, d.get('category_id'), d.get('icon','🕹️'), d.get('cover_url','')))
    conn.commit()
    gid = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
    conn.close()
    return jsonify({'success':True,'game_id':gid})

@app.route('/api/games/<int:gid>', methods=['DELETE'])
def api_del_game(gid):
    conn = get_db()
    for s in conn.execute('SELECT file_path FROM saves WHERE game_id=?',(gid,)).fetchall():
        if s['file_path'] and os.path.exists(s['file_path']):
            os.remove(s['file_path'])
    conn.execute('DELETE FROM saves WHERE game_id=?',(gid,))
    conn.execute('DELETE FROM games WHERE id=?',(gid,))
    conn.commit(); conn.close()
    return jsonify({'success':True})

@app.route('/api/games/<int:gid>', methods=['PUT'])
def api_update_game(gid):
    d = request.json
    conn = get_db()
    # 允许更新：name / category_id / icon / cover_url
    fields = []
    params = []
    if 'name' in d and d['name']:
        fields.append('name=?')
        params.append(d['name'].strip())
    if 'category_id' in d:
        fields.append('category_id=?')
        params.append(d.get('category_id'))
    if 'icon' in d:
        fields.append('icon=?')
        params.append(d.get('icon') or '🕹️')
    if 'cover_url' in d:
        fields.append('cover_url=?')
        params.append(d.get('cover_url') or '')
    if not fields:
        conn.close()
        return jsonify({'success': False, 'message': '没有要更新的字段'}), 400
    params.append(gid)
    conn.execute(f'UPDATE games SET {",".join(fields)} WHERE id=?', params)
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'message': '更新成功'})

@app.route('/api/saves', methods=['GET'])
def api_get_saves():
    gid = request.args.get('game_id', type=int)
    conn = get_db()
    if gid:
        rows = conn.execute(
            'SELECT s.*,g.name as game_name FROM saves s JOIN games g ON s.game_id=g.id WHERE s.game_id=? ORDER BY s.updated_at DESC',
            (gid,)).fetchall()
    else:
        rows = conn.execute(
            'SELECT s.*,g.name as game_name FROM saves s JOIN games g ON s.game_id=g.id ORDER BY s.updated_at DESC'
        ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/saves/upload', methods=['POST'])
def api_upload():
    if 'file' not in request.files:
        return jsonify({'success':False,'message':'没有文件'}),400
    f = request.files['file']
    if not f.filename:
        return jsonify({'success':False,'message':'没有文件'}),400
    gid = request.form.get('game_id', type=int)
    slot = request.form.get('slot_name','').strip()
    note = request.form.get('note','')
    if not gid or not slot:
        return jsonify({'success':False,'message':'缺少参数'}),400
    orig = secure_filename(f.filename) or 'save.dat'
    uname = f"{uuid.uuid4().hex[:8]}_{orig}"
    fpath = os.path.join(SAVE_DIR, uname)
    f.save(fpath)
    fsize = os.path.getsize(fpath)
    conn = get_db()
    ex = conn.execute('SELECT id,file_path,version FROM saves WHERE game_id=? AND slot_name=?',
                      (gid, slot)).fetchone()
    if ex:
        if ex['file_path'] and os.path.exists(ex['file_path']):
            os.remove(ex['file_path'])
        conn.execute(
            "UPDATE saves SET file_name=?,file_path=?,file_size=?,note=?,version=version+1,updated_at=datetime('now','localtime') WHERE id=?",
            (orig, fpath, fsize, note, ex['id']))
        conn.commit(); conn.close()
        return jsonify({'success':True,'message':'已覆盖 v'+str(ex["version"]+1),'overwritten':True})
    else:
        conn.execute(
            'INSERT INTO saves (game_id,slot_name,file_name,file_path,file_size,note) VALUES (?,?,?,?,?,?)',
            (gid, slot, orig, fpath, fsize, note))
        conn.commit(); conn.close()
        return jsonify({'success':True,'message':'保存成功','overwritten':False})

@app.route('/api/saves/<int:sid>/download')
def api_download(sid):
    conn = get_db()
    row = conn.execute('SELECT * FROM saves WHERE id=?',(sid,)).fetchone()
    conn.close()
    if not row or not os.path.exists(row['file_path']):
        return jsonify({'success':False}),404
    return send_file(row['file_path'], as_attachment=True, download_name=row['file_name'])

@app.route('/api/saves/<int:sid>', methods=['DELETE'])
def api_del_save(sid):
    conn = get_db()
    row = conn.execute('SELECT file_path FROM saves WHERE id=?',(sid,)).fetchone()
    if row and row['file_path'] and os.path.exists(row['file_path']):
        os.remove(row['file_path'])
    conn.execute('DELETE FROM saves WHERE id=?',(sid,))
    conn.commit(); conn.close()
    return jsonify({'success':True})

@app.route('/api/search')
def api_search():
    q = request.args.get('q','').strip()
    if not q:
        return jsonify([])
    conn = get_db()
    rows = conn.execute(
        'SELECT s.*,g.name as game_name FROM saves s JOIN games g ON s.game_id=g.id WHERE s.slot_name LIKE ? OR s.note LIKE ? OR g.name LIKE ? ORDER BY s.updated_at DESC',
        ('%'+q+'%', '%'+q+'%', '%'+q+'%')).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/stats')
def api_stats():
    conn = get_db()
    c = conn.execute('SELECT COUNT(*) FROM categories').fetchone()[0]
    g = conn.execute('SELECT COUNT(*) FROM games').fetchone()[0]
    s = conn.execute('SELECT COUNT(*) FROM saves').fetchone()[0]
    sz = conn.execute('SELECT COALESCE(SUM(file_size),0) FROM saves').fetchone()[0]
    conn.close()
    return jsonify({'categories':c,'games':g,'saves':s,'total_size':sz})

# ==================== 刮削 ====================

@app.route('/api/scrape')
def api_scrape():
    """Steam 刮削"""
    name = request.args.get('name', '').strip()
    if not name:
        return jsonify([])
    results = []
    try:
        r = http_requests.get(
            'https://store.steampowered.com/api/storesearch/',
            params={'term': name, 'cc': 'cn', 'l': 'schinese'},
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'},
            timeout=8)
        if r.status_code == 200:
            for item in r.json().get('items', [])[:8]:
                appid = item.get('id', '')
                if appid:
                    img = f'https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/header.jpg'
                else:
                    img = item.get('tiny_image', '') or ''
                results.append({
                    'name': item.get('name', ''),
                    'image': img,
                    'id': appid,
                    'source': 'steam',              # ★ 新增来源标记
                })
    except Exception as e:
        app.logger.warning('scrape error: %s', e)
    return jsonify(results)


@app.route('/api/scrape/image')
def api_scrape_img():
    """图片代理，代理任意图片 URL"""
    url = request.args.get('url', '')
    if not url or not url.startswith('http'):
        return '', 400
    try:
        r = http_requests.get(
            url,
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                              'AppleWebKit/537.36 (KHTML, like Gecko) '
                              'Chrome/120.0 Safari/537.36',
                'Referer': 'https://store.steampowered.com/',
            },
            timeout=12,
            allow_redirects=True)
        if r.status_code == 200 and r.content:
            data = r.content
            if data[:3] == b'\xff\xd8\xff':
                ct = 'image/jpeg'
            elif data[:8] == b'\x89PNG\r\n\x1a\n':
                ct = 'image/png'
            elif data[:4] == b'RIFF' and data[8:12] == b'WEBP':
                ct = 'image/webp'
            elif data[:3] == b'GIF':
                ct = 'image/gif'
            else:
                if data[:1] == b'<':
                    app.logger.warning('scrape img got HTML (blocked): %s', url)
                    return '', 404
                ct = r.headers.get('Content-Type', 'image/jpeg')
                if 'image' not in ct:
                    ct = 'image/jpeg'
            resp = Response(data, mimetype=ct)
            resp.headers['Cache-Control'] = 'public, max-age=86400'
            resp.headers['Access-Control-Allow-Origin'] = '*'
            return resp
        else:
            app.logger.warning('scrape img status=%s url=%s', r.status_code, url)
    except Exception as e:
        app.logger.warning('scrape image error: %s url=%s', e, url)
    return '', 404


# ==================== IGDB（走 Worker 中转）====================

def _get_igdb_token():
    """获取 IGDB access token，走 Worker 中转，带缓存"""
    if _igdb_token_cache['token'] and _igdb_token_cache['expires'] > time.time():
        return _igdb_token_cache['token']
    if not IGDB_CLIENT_ID or not IGDB_CLIENT_SECRET:
        app.logger.warning('igdb: missing client id/secret')
        return None
    try:
        # ★ 关键：用 data= 把参数放到 POST body 里，不要用 params=
        r = http_requests.post(
            f'{IGDB_PROXY}/?url=https://id.twitch.tv/oauth2/token',
            data={
                'client_id': IGDB_CLIENT_ID,
                'client_secret': IGDB_CLIENT_SECRET,
                'grant_type': 'client_credentials',
            },
            timeout=15)
        if r.status_code != 200:
            app.logger.warning('igdb token failed: %s %s', r.status_code, r.text[:200])
            return None
        d = r.json()
        _igdb_token_cache['token'] = d['access_token']
        _igdb_token_cache['expires'] = time.time() + d.get('expires_in', 3600) - 60
        return d['access_token']
    except Exception as e:
        app.logger.warning('igdb token error: %s', e)
        return None


@app.route('/api/scrape/igdb')
def api_scrape_igdb():
    """IGDB 搜索，覆盖全平台，走 Worker 中转"""
    name = request.args.get('name', '').strip()
    if not name:
        return jsonify([])
    token = _get_igdb_token()
    if not token:
        return jsonify([])
    # ★ 转义特殊字符（必须在 post 之前）
    safe_name = name.replace('\\', '\\\\').replace('"', '\\"').replace('\n', ' ').replace('\r', ' ')
    try:
        r = http_requests.post(
            f'{IGDB_PROXY}/?url=https://api.igdb.com/v4/games',
            headers={
                'Client-ID': IGDB_CLIENT_ID,
                'Authorization': f'Bearer {token}',
                'Accept': 'application/json',
            },
            data=f'search "{safe_name}"; fields name,cover.url,artworks.url; limit 8;',
            timeout=15)
        if r.status_code != 200:
            app.logger.warning('igdb search failed: %s %s', r.status_code, r.text[:200])
            return jsonify([])
        results = []
        for item in r.json():
            img = ''
            # ★ 优先 artworks（横图），用 t_1080p 大尺寸
            if item.get('artworks') and len(item['artworks']) > 0:
                img = item['artworks'][0].get('url', '')
                if img:
                    img = 'https:' + img.replace('t_thumb', 't_1080p')
            # ★ 没有 artworks 就退回 cover（竖图）
            if not img and item.get('cover') and item['cover'].get('url'):
                img = item['cover']['url']
                img = 'https:' + img.replace('t_thumb', 't_cover_big')
            results.append({
                'name': item.get('name', ''),
                'image': img,
                'id': f"igdb_{item.get('id')}",
                'source': 'igdb',
            })
        return jsonify(results)
    except Exception as e:
        app.logger.warning('igdb error: %s', e)
        return jsonify([])


# ==================== 前端 ====================

@app.route('/favicon.ico')
def favicon():
    from flask import send_from_directory
    return send_from_directory(
        os.path.join(BASE_DIR, 'static'),
        'logo.png',
        mimetype='image/png'
    )

@app.route('/')
def index():
    return render_template('index.html')


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)