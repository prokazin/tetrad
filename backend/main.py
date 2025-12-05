from flask import Flask, jsonify, request
from flask_cors import CORS
import json, os, time

DATA_FILE = 'leaderboard.json'
app = Flask(__name__)
CORS(app)

def load_data():
    if not os.path.exists(DATA_FILE):
        return {}
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_data(d):
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=2)

@app.route('/api/leaderboard', methods=['GET'])
def get_leaderboard():
    d = load_data()
    # return sorted list
    items = sorted(d.values(), key=lambda x: x.get('balance',0), reverse=True)
    return jsonify(items)

@app.route('/api/leaderboard', methods=['POST'])
def post_score():
    body = request.json or {}
    name = body.get('name') or 'Anon'
    balance = float(body.get('balance', 0))
    uid = body.get('id') or str(int(time.time()*1000))
    d = load_data()
    d[uid] = {'id': uid, 'name': name, 'balance': balance, 'updated': int(time.time())}
    save_data(d)
    return jsonify({'ok': True, 'id': uid})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
