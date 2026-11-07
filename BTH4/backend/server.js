import http from "node:http";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mqtt from "mqtt";
import { DatabaseSync } from "node:sqlite";

const backendDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(backendDir, "..", "frontend");
const legacyDataFile = path.join(backendDir, "data.json");
const databaseFile = path.join(backendDir, "sensors.sqlite");
const port = Number(process.env.PORT || 3000);
const mqttUrl = process.env.MQTT_URL || "mqtt://172.20.10.3:1884";
const mqttOptions = {
  username: process.env.MQTT_USER || "",
  password: process.env.MQTT_PASSWORD || "",
  reconnectPeriod: 2000,
  connectTimeout: 5000
};

const topics = {
  sensor: "iot/sensor/all",
  virtualSensors: "iot/sensor/virtual", // Topic cho 3 cảm biến môi trường (Độ mặn, AQI, Áp suất)
  deviceStatus: "iot/device/esp8266/status",
  leds: {
    led1: { set: "iot/device/led1/set", state: "iot/device/led1/state" },
    led2: { set: "iot/device/led2/set", state: "iot/device/led2/state" },
    led3: { set: "iot/device/led3/set", state: "iot/device/led3/state" }
  }
};

const db = new DatabaseSync(databaseFile);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    userID INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    passwordHash TEXT NOT NULL, fullName TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, createdAt INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sensor_samples (
    id TEXT PRIMARY KEY, temperature REAL NOT NULL, humidity REAL NOT NULL, light INTEGER NOT NULL, time INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS virtual_sensor_samples (
    id TEXT PRIMARY KEY, cb1 INTEGER NOT NULL CHECK (cb1 BETWEEN 0 AND 11),
    cb2 INTEGER NOT NULL CHECK (cb2 BETWEEN 0 AND 101), cb3 INTEGER NOT NULL CHECK (cb3 BETWEEN 0 AND 1001), time INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS actions (
    id TEXT PRIMARY KEY, deviceID TEXT NOT NULL, action TEXT NOT NULL, status TEXT NOT NULL, time INTEGER NOT NULL,
    userID INTEGER REFERENCES users(userID) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS migration_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_virtual_sensor_time ON virtual_sensor_samples(time);
  CREATE INDEX IF NOT EXISTS idx_sensor_time ON sensor_samples(time);
  CREATE INDEX IF NOT EXISTS idx_action_time ON actions(time);
`);

const insertSensor = db.prepare("INSERT OR REPLACE INTO sensor_samples (id, temperature, humidity, light, time) VALUES (?, ?, ?, ?, ?)");
const insertVirtual = db.prepare("INSERT OR REPLACE INTO virtual_sensor_samples (id, cb1, cb2, cb3, time) VALUES (?, ?, ?, ?, ?)");
const actionColumns = db.prepare("PRAGMA table_info(actions)").all();
if (!actionColumns.some(column => column.name === "userID")) db.exec("ALTER TABLE actions ADD COLUMN userID INTEGER REFERENCES users(userID) ON DELETE SET NULL");
db.exec("CREATE INDEX IF NOT EXISTS idx_action_user ON actions(userID)");
const insertAction = db.prepare("INSERT OR REPLACE INTO actions (id, deviceID, action, status, time, userID) VALUES (?, ?, ?, ?, ?, ?)");
const createInitialUser = db.prepare("INSERT OR IGNORE INTO users (username, passwordHash, fullName, email, createdAt) VALUES (?, ?, ?, ?, ?)");
const initialUsername = (process.env.ADMIN_USERNAME || "").trim();
const initialPassword = process.env.ADMIN_PASSWORD || "";
if (initialUsername && initialPassword && Number(db.prepare("SELECT COUNT(*) AS count FROM users").get().count) === 0) {
  const initialEmail = (process.env.ADMIN_EMAIL || (initialUsername + "@localhost")).trim().toLowerCase();
  const initialFullName = (process.env.ADMIN_FULL_NAME || initialUsername).trim();
  createInitialUser.run(initialUsername, createPasswordHash(initialPassword), initialFullName, initialEmail, Date.now());
}

// Import earlier JSON records once, then SQLite becomes the source of truth.
if (!db.prepare("SELECT 1 FROM migration_state WHERE key = ?").get("json-v1")) {
  let legacy = {};
  try { legacy = JSON.parse(fsSync.readFileSync(legacyDataFile, "utf8")); } catch {}
  db.exec("BEGIN");
  try {
    for (const item of Array.isArray(legacy.sensors) ? legacy.sensors : []) {
      if (item && item.id && [item.temperature, item.humidity, item.light, item.time].every(Number.isFinite)) {
        insertSensor.run(item.id, item.temperature, item.humidity, item.light, item.time);
      }
    }
    for (const item of Array.isArray(legacy.virtualSensors) ? legacy.virtualSensors : []) {
      if (item && item.id && [item.cb1, item.cb2, item.cb3, item.time].every(Number.isFinite) &&
          item.cb1 >= 0 && item.cb1 <= 11 && item.cb2 >= 0 && item.cb2 <= 101 && item.cb3 >= 0 && item.cb3 <= 1001) {
        insertVirtual.run(item.id, item.cb1, item.cb2, item.cb3, item.time);
      }
    }
    for (const item of Array.isArray(legacy.actions) ? legacy.actions : []) {
      if (item && item.id && item.deviceID && item.action && item.status && Number.isFinite(item.time)) {
        insertAction.run(item.id, item.deviceID, item.action, item.status, item.time, null);
      }
    }
    db.prepare("INSERT INTO migration_state (key, value) VALUES (?, ?)").run("json-v1", "complete");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

const state = {
  mqttConnected: false,
  deviceOnline: false,
  leds: { led1: false, led2: false, led3: false },
  sensors: db.prepare("SELECT * FROM (SELECT * FROM sensor_samples ORDER BY time DESC LIMIT 1000) ORDER BY time ASC").all(),
  virtualSensors: db.prepare("SELECT * FROM (SELECT * FROM virtual_sensor_samples ORDER BY time DESC LIMIT 1000) ORDER BY time ASC").all(),
  actions: db.prepare("SELECT * FROM actions ORDER BY time DESC LIMIT 100").all()
};
state.latestSensor = state.sensors.at(-1) || null;
state.latestVirtual = state.virtualSensors.at(-1) || null;
let nextActionNumber = Math.max(50, ...state.actions.map(item => Number(String(item.id).replace("#A", "")) || 0)) + 1;
let nextSensorNumber = Math.max(0, ...state.sensors.map(item => Number(String(item.id).replace("#S", "")) || 0)) + 1;
let nextVirtualNumber = Math.max(0, ...state.virtualSensors.map(item => Number(String(item.id).replace("#V", "")) || 0)) + 1;

let sensorPruneCounter = 0;
function persistSensor(item) {
  insertSensor.run(item.id, item.temperature, item.humidity, item.light, item.time);
  if (++sensorPruneCounter >= 50) {
    sensorPruneCounter = 0;
    db.prepare("DELETE FROM sensor_samples WHERE id NOT IN (SELECT id FROM sensor_samples ORDER BY time DESC LIMIT 1000)").run();
  }
}
let virtualPruneCounter = 0;
function persistVirtual(item) {
  insertVirtual.run(item.id, item.cb1, item.cb2, item.cb3, item.time);
  if (++virtualPruneCounter >= 50) {
    virtualPruneCounter = 0;
    db.prepare("DELETE FROM virtual_sensor_samples WHERE id NOT IN (SELECT id FROM virtual_sensor_samples ORDER BY time DESC LIMIT 1000)").run();
  }
}
function persistAction(item) {
  insertAction.run(item.id, item.deviceID, item.action, item.status, item.time, item.userID ?? null);
  db.prepare("DELETE FROM actions WHERE id NOT IN (SELECT id FROM actions ORDER BY time DESC LIMIT 100)").run();
}

const mqttClient = mqtt.connect(mqttUrl, mqttOptions);
mqttClient.on("connect", () => {
  state.mqttConnected = true;
  mqttClient.subscribe([
    topics.sensor,
    topics.virtualSensors,
    topics.deviceStatus,
    ...Object.values(topics.leds).map(item => item.state)
  ]);
  console.log(`Đã kết nối MQTT ${mqttUrl}`);
});
mqttClient.on("reconnect", () => { state.mqttConnected = false; });
mqttClient.on("close", () => { state.mqttConnected = false; });
mqttClient.on("error", error => console.error("MQTT:", error.message));

const pendingCommands = new Map();
const activeSessions = new Map();
mqttClient.on("message", (topic, payload) => {
  const message = payload.toString().trim();
  if (topic === topics.deviceStatus) {
    state.deviceOnline = message.toUpperCase() === "ONLINE";
    return;
  }

  // 1. Dữ liệu cảm biến thật (DHT11, LDR)
  if (topic === topics.sensor) {
    try {
      const data = JSON.parse(message);
      if (![data.temperature, data.humidity, data.light].every(value => Number.isFinite(Number(value)))) return;
      const record = {
        id: "#S" + String(nextSensorNumber++).padStart(5, "0"),
        temperature: Number(data.temperature),
        humidity: Number(data.humidity),
        light: Number(data.light),
        time: Date.now()
      };
      state.latestSensor = record;
      state.sensors.push(record);
      if (state.sensors.length > 1000) state.sensors.shift();
      persistSensor(record);
    } catch (error) {
      console.warn("Bỏ qua gói cảm biến không hợp lệ:", error.message);
    }
    return;
  }

  // 2. Dữ liệu 3 Cảm biến môi trường: Độ mặn, AQI, Áp suất
  if (topic === topics.virtualSensors) {
    try {
      const data = JSON.parse(message);
      if (Number.isFinite(Number(data.cb1)) && Number.isFinite(Number(data.cb2)) && Number.isFinite(Number(data.cb3)) &&
          Number(data.cb1) >= 0 && Number(data.cb1) <= 11 &&
          Number(data.cb2) >= 0 && Number(data.cb2) <= 101 &&
          Number(data.cb3) >= 0 && Number(data.cb3) <= 1001) {
        const record = {
          id: "#V" + String(nextVirtualNumber++).padStart(5, "0"),
          cb1: Number(data.cb1),
          cb2: Number(data.cb2),
          cb3: Number(data.cb3),
          time: Date.now()
        };
        state.latestVirtual = record;
        state.virtualSensors.push(record);
        if (state.virtualSensors.length > 1000) state.virtualSensors.shift();
        persistVirtual(record);
      }
    } catch (error) {
      console.warn("Bỏ qua gói cảm biến ảo không hợp lệ:", error.message);
    }
    return;
  }

  // 3. Phản hồi LED từ ESP8266
  for (const [deviceID, item] of Object.entries(topics.leds)) {
    if (topic !== item.state) continue;
    const actual = message.toUpperCase();
    if (actual !== "ON" && actual !== "OFF") return;
    const isOn = actual === "ON";
    state.leds[deviceID] = isOn;
    const pending = pendingCommands.get(deviceID);
    if (pending && pending.isOn === isOn) {
      clearTimeout(pending.timeout);
      pendingCommands.delete(deviceID);
      const action = pending.action;
      action.status = "SUCCESS";
      action.time = Date.now();
      state.actions = state.actions.filter(item => item.id !== action.id);
      state.actions.unshift(action);
      state.actions = state.actions.slice(0, 100);
      persistAction(action);
      pending.resolve(action);
    }
  }
});

function sendJson(response, status, body, extraHeaders = {}) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
  }
  return raw ? JSON.parse(raw) : {};
}

function createPasswordHash(password) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
function verifyPassword(password, storedHash) {
  if (typeof storedHash !== "string") return false;
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash || !/^[a-f0-9]+$/i.test(hash)) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
function getSessionID(request) {
  const entry = (request.headers.cookie || "").split(";").map(v => v.trim()).find(v => v.startsWith("iot_session="));
  return entry ? entry.slice("iot_session=".length) : "";
}
function getAuthenticatedUser(request) {
  const id = getSessionID(request), session = activeSessions.get(id);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) { activeSessions.delete(id); return null; }
  return db.prepare("SELECT userID, username, fullName, email, createdAt FROM users WHERE userID = ?").get(session.userID) || null;
}
function parseTimeCriteria(input) {
  const value = String(input || "").trim(); if (!value) return null;
  const criteria = {}; let dateText = value, timeText = '';
  if (value.includes(':')) {
    const match = value.match(/(?:^| )(\d{1,2}(?::\d{1,2}(?::\d{1,2})?)?)$/);
    if (!match) throw new Error("\u0110\u1ecbnh d\u1ea1ng gi\u1edd c\u1ea7n l\u00e0 hh:mm ho\u1eb7c hh:mm:ss.");
    timeText = match[1]; dateText = value.slice(0, match.index).trim();
  } else {
    const tokens = value.split(/\s+/);
    const hasHour = tokens.length === 3 && (!/^\d{4}$/.test(tokens[0]) || Number(tokens[1]) > 12);
    if (tokens.length === 4 || hasHour) { timeText = tokens.pop(); dateText = tokens.join(' '); }
  }
  const dateTokens = dateText ? dateText.split(/\s+/) : [];
  if (dateTokens.length > 3 || dateTokens.some(t => !/^\d{1,4}$/.test(t))) throw new Error("Nh\u1eadp ng\u00e0y theo th\u1ee9 t\u1ef1 YYYY MM DD; c\u00f3 th\u1ec3 b\u1ecf n\u0103m ho\u1eb7c th\u00e1ng.");
  if (dateTokens.some((t,i) => t.length === 4 && i !== 0)) throw new Error("N\u1ebfu nh\u1eadp n\u0103m, h\u00e3y \u0111\u1eb7t n\u0103m \u1edf \u0111\u1ea7u chu\u1ed7i.");
  let values = dateTokens.map(Number);
  if (values[0] && dateTokens[0].length === 4) {
    criteria.year = values[0]; values = values.slice(1);
    if (values.length === 1) criteria.monthOrDay = values[0];
    if (values.length === 2) [criteria.month, criteria.day] = values;
  } else if (values.length === 1) criteria.day = values[0];
  else if (values.length === 2) [criteria.month, criteria.day] = values;
  if (criteria.month !== undefined && (criteria.month < 1 || criteria.month > 12)) throw new Error("Th\u00e1ng c\u1ea7n n\u1eb1m trong kho\u1ea3ng 1 \u0111\u1ebfn 12.");
  if (criteria.day !== undefined && (criteria.day < 1 || criteria.day > 31)) throw new Error("Ng\u00e0y c\u1ea7n n\u1eb1m trong kho\u1ea3ng 1 \u0111\u1ebfn 31.");
  if (criteria.monthOrDay !== undefined && (criteria.monthOrDay < 1 || criteria.monthOrDay > 31)) throw new Error("Gi\u00e1 tr\u1ecb th\u00e1ng/ng\u00e0y c\u1ea7n n\u1eb1m trong kho\u1ea3ng 1 \u0111\u1ebfn 31.");
  if (timeText) {
    const tokens = timeText.split(':');
    if (tokens.some(t => !/^\d{1,2}$/.test(t))) throw new Error("\u0110\u1ecbnh d\u1ea1ng gi\u1edd c\u1ea7n l\u00e0 hh, hh:mm ho\u1eb7c hh:mm:ss.");
    const [hour, minute, second] = tokens.map(Number);
    if (hour > 23 || (minute !== undefined && minute > 59) || (second !== undefined && second > 59)) throw new Error("Gi\u00e1 tr\u1ecb gi\u1edd, ph\u00fat ho\u1eb7c gi\u00e2y kh\u00f4ng h\u1ee3p l\u1ec7.");
    criteria.hour = hour; if (minute !== undefined) criteria.minute = minute; if (second !== undefined) criteria.second = second;
  }
  return criteria;
}
function appendTimeFilters(where, params, criteria, column = 'time') {
  if (!criteria) return;
  const quote = String.fromCharCode(39);
  const fields = [["year","%Y"],["month","%m"],["day","%d"],["hour","%H"],["minute","%M"],["second","%S"]];
  for (const [key, fmt] of fields) if (criteria[key] !== undefined) {
    where.push("strftime(" + quote + fmt + quote + ", " + column + " / 1000.0, " + quote + "unixepoch" + quote + ", " + quote + "localtime" + quote + ") = ?");
    params.push(String(criteria[key]).padStart(2,"0"));
  }
  if (criteria.monthOrDay !== undefined) {
    where.push("(strftime(" + quote + "%m" + quote + ", " + column + " / 1000.0, " + quote + "unixepoch" + quote + ", " + quote + "localtime" + quote + ") = ? OR strftime(" + quote + "%d" + quote + ", " + column + " / 1000.0, " + quote + "unixepoch" + quote + ", " + quote + "localtime" + quote + ") = ?)");
    const v=String(criteria.monthOrDay).padStart(2,"0"); params.push(v,v);
  }
}
function parsePage(url, fallback) {
  const p=Number.parseInt(url.searchParams.get("page")||"1",10), s=Number.parseInt(url.searchParams.get("pageSize")||String(fallback),10);
  return { page:Number.isFinite(p)?Math.max(1,p):1, pageSize:Number.isFinite(s)?Math.min(100,Math.max(1,s)):fallback };
}
function sendPaged(response, records, total, page, pageSize) {
  sendJson(response,200,{records,pagination:{page,pageSize,total,totalPages:Math.ceil(total/pageSize)}});
}

function mimeType(file) {
  return ({
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".pdf": "application/pdf"
  })[path.extname(file).toLowerCase()] || "application/octet-stream";
}

async function serveStatic(request, response, pathname) {
  let relative = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  if (relative.split("/").some(part => part.startsWith("."))) {
    response.writeHead(404).end("Not found");
    return;
  }
  const file = path.resolve(frontendDir, "." + relative);
  if (!file.startsWith(frontendDir + path.sep)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const content = await fs.readFile(file);
    response.writeHead(200, { "Content-Type": mimeType(file), "Cache-Control": "no-cache" });
    response.end(content);
  } catch {
    response.writeHead(404).end("Not found");
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  // Trạng thái chung
  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    try {
      const body = await readJson(request);
      const identifier = String(body.identifier || body.email || body.username || "").trim();
      const password = String(body.password || "");
      if (!identifier || !password) return sendJson(response,400,{error:"Nh\u1eadp t\u00e0i kho\u1ea3n/email v\u00e0 m\u1eadt kh\u1ea9u."});
      const user = db.prepare("SELECT userID, username, passwordHash, fullName, email, createdAt FROM users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE").get(identifier,identifier);
      if (!user || !verifyPassword(password,user.passwordHash)) {
        const hasUsers=Number(db.prepare("SELECT COUNT(*) AS count FROM users").get().count)>0;
        return sendJson(response,401,{error:hasUsers?"T\u00e0i kho\u1ea3n ho\u1eb7c m\u1eadt kh\u1ea9u kh\u00f4ng ch\u00ednh x\u00e1c.":"Ch\u01b0a c\u00f3 t\u00e0i kho\u1ea3n. H\u00e3y c\u1ea5u h\u00ecnh ADMIN_USERNAME v\u00e0 ADMIN_PASSWORD trong backend/.env r\u1ed3i kh\u1edfi \u0111\u1ed9ng l\u1ea1i."});
      }
      const sessionID=randomBytes(32).toString("hex"), expiresAt=Date.now()+12*60*60*1000;
      activeSessions.set(sessionID,{userID:user.userID,expiresAt});
      const secure=request.socket.encrypted?"; Secure":"";
      return sendJson(response,200,{ok:true,user:{userID:user.userID,username:user.username,fullName:user.fullName,email:user.email,createdAt:user.createdAt}},{ "Set-Cookie":"iot_session="+sessionID+"; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200"+secure });
    } catch { return sendJson(response,400,{error:"Y\u00eau c\u1ea7u \u0111\u0103ng nh\u1eadp kh\u00f4ng h\u1ee3p l\u1ec7."}); }
  }
  if (url.pathname === "/api/auth/logout" && ["GET","POST"].includes(request.method)) {
    const id=getSessionID(request); if(id) activeSessions.delete(id);
    response.writeHead(302,{"Location":"/login.html","Set-Cookie":"iot_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"}).end(); return;
  }
  const authenticatedUser=getAuthenticatedUser(request);
  if (url.pathname === "/api/auth/me" && request.method === "GET") {
    if(!authenticatedUser) return sendJson(response,401,{error:"C\u1ea7n \u0111\u0103ng nh\u1eadp."});
    return sendJson(response,200,{user:authenticatedUser});
  }
  if (url.pathname.startsWith("/api/") && !authenticatedUser) return sendJson(response,401,{error:"Phi\u00ean \u0111\u0103ng nh\u1eadp \u0111\u00e3 h\u1ebft h\u1ea1n. Vui l\u00f2ng \u0111\u0103ng nh\u1eadp l\u1ea1i."});

  if (url.pathname === "/api/state" && request.method === "GET") {
    sendJson(response, 200, {
      mqttConnected: state.mqttConnected,
      deviceOnline: state.deviceOnline,
      leds: state.leds,
      latestSensor: state.latestSensor,
      sensors: state.sensors.slice(-16)
    });
    return;
  }

  // API riêng cho Cảm biến Environment
  if (url.pathname === "/api/profile" && request.method === "GET") {
    sendJson(response,200,{user:authenticatedUser}); return;
  }

  if (url.pathname === "/api/virtual-sensors/state" && request.method === "GET") {
    sendJson(response, 200, {
      mqttConnected: state.mqttConnected,
      deviceOnline: state.deviceOnline,
      latest: state.latestVirtual,
      records: state.virtualSensors.slice(-20)
    });
    return;
  }

  // API tra cứu dữ liệu (gộp cả cảm biến thật và các cảm biến môi trường)
  if (url.pathname === "/api/sensors" && request.method === "GET") {
    const type=url.searchParams.get("type")||"";
    const valid=new Set(["temperature","humidity","light","cb1","cb2","cb3"]);
    if(type&&type!=="all"&&type!=="date"&&!valid.has(type)) return sendJson(response,400,{error:"Lo\u1ea1i c\u1ea3m bi\u1ebfn kh\u00f4ng h\u1ee3p l\u1ec7."});
    const where=[],params=[];
    if(valid.has(type)){where.push("sensorType = ?");params.push(type);}
    const value=url.searchParams.get("value");
    if(value!==null&&value.trim()!==""){const n=Number(value);if(!Number.isFinite(n))return sendJson(response,400,{error:"Gi\u00e1 tr\u1ecb t\u00ecm ki\u1ebfm ph\u1ea3i l\u00e0 s\u1ed1."});where.push("value = ?");params.push(n);}
    const keyword=url.searchParams.get("keyword")||"";
    if((type==="all"||!type)&&keyword.trim()){const like="%"+keyword.trim()+"%";where.push("(id LIKE ? OR sensorID LIKE ? OR sensor LIKE ? OR CAST(value AS TEXT) LIKE ? OR unit LIKE ? OR status LIKE ?)");params.push(like,like,like,like,like,like);}
    const timeValue=url.searchParams.get("time")||"";
    if(timeValue.trim()){let criteria;try{criteria=parseTimeCriteria(timeValue);}catch(error){return sendJson(response,400,{error:error.message});}appendTimeFilters(where,params,criteria);}
    const paging=parsePage(url,12), sqlWhere=where.length?' WHERE '+where.join(' AND '):'';
    const recordsSql = "SELECT id || '-T' AS id, 'DHT01' AS sensorID, 'Nhi\u1ec7t \u0111\u1ed9 ph\u00f2ng' AS sensor, 'temperature' AS sensorType, temperature AS value, '\u00b0C' AS unit, 'B\u00ecnh th\u01b0\u1eddng' AS status, time FROM sensor_samples " +
      "UNION ALL SELECT id || '-H', 'DHT01', '\u0110\u1ed9 \u1ea9m ph\u00f2ng', 'humidity', humidity, '%', 'B\u00ecnh th\u01b0\u1eddng', time FROM sensor_samples " +
      "UNION ALL SELECT id || '-L', 'LDR01', '\u00c1nh s\u00e1ng ph\u00f2ng', 'light', light, 'ADC', 'B\u00ecnh th\u01b0\u1eddng', time FROM sensor_samples " +
      "UNION ALL SELECT id || '-1', 'CB1', 'CB1', 'cb1', cb1, '', CASE WHEN cb1 > 5.5 THEN 'Over threshold' ELSE 'Normal' END, time FROM virtual_sensor_samples " +
      "UNION ALL SELECT id || '-2', 'CB2', 'CB2', 'cb2', cb2, '', CASE WHEN cb2 > 50.5 THEN 'Over threshold' ELSE 'Normal' END, time FROM virtual_sensor_samples " +
      "UNION ALL SELECT id || '-3', 'CB3', 'CB3', 'cb3', cb3, '', CASE WHEN cb3 > 500.5 THEN 'Over threshold' ELSE 'Normal' END, time FROM virtual_sensor_samples";
    const total=Number(db.prepare("SELECT COUNT(*) AS total FROM ("+recordsSql+") AS sensor_records"+sqlWhere).get(...params).total);
    const records=db.prepare("SELECT * FROM ("+recordsSql+") AS sensor_records"+sqlWhere+" ORDER BY time DESC LIMIT ? OFFSET ?").all(...params,paging.pageSize,(paging.page-1)*paging.pageSize);
    return sendPaged(response,records,total,paging.page,paging.pageSize);
  }
  if (url.pathname === "/api/actions" && request.method === "GET") {
    const where=[],params=[];
    const deviceID=url.searchParams.get("deviceID")||"", action=url.searchParams.get("action")||"", status=url.searchParams.get("status")||"";
    if(deviceID){where.push("a.deviceID = ?");params.push(deviceID);}
    if(action){where.push("a.action = ?");params.push(action);}
    if(status){where.push("a.status = ?");params.push(status);}
    const timeValue=url.searchParams.get("time")||"";
    if(timeValue.trim()){let criteria;try{criteria=parseTimeCriteria(timeValue);}catch(error){return sendJson(response,400,{error:error.message});}appendTimeFilters(where,params,criteria,"a.time");}
    const paging=parsePage(url,10), sqlWhere=where.length?' WHERE '+where.join(' AND '):'';
    const total=Number(db.prepare("SELECT COUNT(*) AS total FROM actions AS a"+sqlWhere).get(...params).total);
    const records=db.prepare("SELECT a.*,u.username,u.fullName AS userName FROM actions AS a LEFT JOIN users AS u ON u.userID=a.userID"+sqlWhere+" ORDER BY a.time DESC LIMIT ? OFFSET ?").all(...params,paging.pageSize,(paging.page-1)*paging.pageSize);
    return sendPaged(response,records,total,paging.page,paging.pageSize);
  }
  const deviceMatch = url.pathname.match(/^\/api\/devices\/(led[123])(?:\/actions)?$/);
  if (deviceMatch && request.method === "POST") {
    const deviceID = deviceMatch[1];
    try {
      const body = await readJson(request);
      let isOn;
      if (typeof body.state === "boolean") {
        isOn = body.state;
      } else if (typeof body.action === "string") {
        const act = body.action.trim().toUpperCase();
        if (act === "ON") isOn = true;
        else if (act === "OFF") isOn = false;
        else return sendJson(response, 400, { error: "action phải là 'ON' hoặc 'OFF'." });
      } else {
        return sendJson(response, 400, { error: "Thiếu tham số 'state' (true/false) hoặc 'action' ('ON'/'OFF')." });
      }

      if (!state.mqttConnected) return sendJson(response, 503, { error: "Backend chưa kết nối MQTT broker." });
      if (!state.deviceOnline) return sendJson(response, 503, { error: "ESP8266 đang offline." });
      if (pendingCommands.has(deviceID)) return sendJson(response, 409, { error: "Thiết bị đang xử lý lệnh trước." });

      const action = { id: "#A" + String(nextActionNumber++).padStart(4, "0"), deviceID,
        action: isOn ? "ON" : "OFF", status: "PENDING", time: Date.now(), userID: authenticatedUser.userID };
      state.actions.unshift(action);
      state.actions = state.actions.slice(0, 100);
      persistAction(action);
      const result = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          const pending = pendingCommands.get(deviceID);
          if (!pending || pending.action.id !== action.id) return;
          pendingCommands.delete(deviceID);
          action.status = "TIMEOUT";
          action.time = Date.now();
          state.actions = state.actions.filter(item => item.id !== action.id);
          state.actions.unshift(action);
          persistAction(action);
          reject(new Error("ESP8266 không xác nhận lệnh trong 5 giây."));
        }, 5000);
        pendingCommands.set(deviceID, { isOn, timeout, resolve, userID: authenticatedUser.userID, action });
        mqttClient.publish(topics.leds[deviceID].set, isOn ? "ON" : "OFF", { qos: 1 }, error => {
          const pending = pendingCommands.get(deviceID);
          if (error && pending && pending.action.id === action.id) {
            clearTimeout(timeout);
            pendingCommands.delete(deviceID);
            action.status = "FAILED";
            action.time = Date.now();
            state.actions = state.actions.filter(item => item.id !== action.id);
            state.actions.unshift(action);
            persistAction(action);
            reject(error);
          }
        });
      });
      const completedAction = await result;
      sendJson(response, 200, { ok: true, action: completedAction, leds: state.leds });
    } catch (error) {
      sendJson(response, error.message.includes("5 giây") ? 504 : 500, { error: error.message });
    }
    return;
  }

  if (url.pathname.startsWith("/api/")) return sendJson(response, 404, { error: "API không tồn tại." });
  if (request.method !== "GET" && request.method !== "HEAD") return response.writeHead(405).end();
  const page=url.pathname.toLowerCase();
  if ((page === "/" || page.endsWith(".html")) && page !== "/login.html" && !authenticatedUser) { response.writeHead(302,{Location:"/login.html"}).end(); return; }
  serveStatic(request, response, url.pathname);
});

server.listen(port, "0.0.0.0", () => console.log(`Dashboard: http://localhost:${port}`));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    mqttClient.end(true);
    server.close(() => { db.close(); process.exit(0); });
  });
}
