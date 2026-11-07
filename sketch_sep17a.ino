#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>

const char* WIFI_SSID = "hoanghiep";
const char* WIFI_PASSWORD = "hoanghiep29";
const char* TOPIC_DEVICE_STATUS = "iot/device/esp8266/status";
const char* TOPIC_LED_ALL_SET = "iot/device/led/all/set";
const char* TOPIC_SENSOR_ALL = "iot/sensor/all";
const char* TOPIC_SENSOR_VIRTUAL = "iot/sensor/virtual";

const char* MQTT_SERVER = "172.20.10.3";
const int MQTT_PORT = 1884;

const bool MQTT_USE_AUTH = true;
const char* MQTT_USER = "iot_user";
const char* MQTT_PASSWORD = "hoanghiep1";

// =====================================================
// DHT11 & LIGHT SENSOR
// =====================================================
#define DHTPIN D5
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

#define LIGHT_PIN A0

// =====================================================
// LED DIEU KHIEN (3 den led co san)
// =====================================================
#define LED1 D1
#define LED2 D2
#define LED3 D6

// =====================================================
// 3 BONG DEN CANH BAO CHO 3 CAM BIEN AO (BTH4)
// D8: Den CB1, D7: Den CB2, D3: Den CB3 (khop thu tu bong tren mach)
// =====================================================
#define LED_ALERT1 D8
#define LED_ALERT2 D7
#define LED_ALERT3 D3

// =====================================================
// MQTT TOPICS
// =====================================================
const char* TOPIC_TEMP = "iot/sensor/temperature";
const char* TOPIC_HUMIDITY = "iot/sensor/humidity";
const char* TOPIC_LIGHT = "iot/sensor/light";

const char* TOPIC_LED1_SET = "iot/device/led1/set";
const char* TOPIC_LED2_SET = "iot/device/led2/set";
const char* TOPIC_LED3_SET = "iot/device/led3/set";

const char* TOPIC_LED1_STATE = "iot/device/led1/state";
const char* TOPIC_LED2_STATE = "iot/device/led2/state";
const char* TOPIC_LED3_STATE = "iot/device/led3/state";

// =====================================================
WiFiClient espClient;
PubSubClient mqttClient(espClient);

unsigned long lastPublishReal = 0;
unsigned long lastPublishVirtual = 0;
unsigned long lastBlinkTime = 0;
bool blinkState = false;

// Bien luu trang thai nhap nhay cua 3 den canh bao
bool isBlinking1 = false;
bool isBlinking2 = false;
bool isBlinking3 = false;

// Bien luu trang thai bat/tat 3 LED dieu khien (mac dinh OFF de chong sang map mo)
bool led1State = false;
bool led2State = false;
bool led3State = false;

// =====================================================
// KET NOI WIFI
// =====================================================
void connectWiFi() {
  Serial.println();
  Serial.print("Dang ket noi WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    // Duy tri xuat muc LOW cho tat ca cac den trong qua trinh doi WiFi
    // de chong hien tuong xung nhieu RF lam den D8, D3 bi sang mo
    digitalWrite(LED1, LOW);
    digitalWrite(LED2, LOW);
    digitalWrite(LED3, LOW);
    digitalWrite(LED_ALERT1, LOW);
    digitalWrite(LED_ALERT2, LOW);
    digitalWrite(LED_ALERT3, LOW);
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("Da ket noi WiFi!");
  Serial.print("ESP8266 IP: ");
  Serial.println(WiFi.localIP());
}

// =====================================================
// GUI TRANG THAI LED LEN MQTT
// =====================================================
void publishLedState(const char* topic, bool state) {
  if (state) {
    mqttClient.publish(topic, "ON", true);
  } else {
    mqttClient.publish(topic, "OFF", true);
  }
}

// =====================================================
// XU LY MQTT CALLBACK
// =====================================================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  message.trim();
  message.toUpperCase();

  Serial.println();
  Serial.println("===== MQTT RECEIVED =====");
  Serial.print("Topic   : ");
  Serial.println(topic);
  Serial.print("Payload : ");
  Serial.println(message);

  if (String(topic) == TOPIC_LED1_SET) {
    if (message == "ON") {
      led1State = true;
      digitalWrite(LED1, HIGH);
      publishLedState(TOPIC_LED1_STATE, true);
    } else if (message == "OFF") {
      led1State = false;
      digitalWrite(LED1, LOW);
      publishLedState(TOPIC_LED1_STATE, false);
    }
  } else if (String(topic) == TOPIC_LED2_SET) {
    if (message == "ON") {
      led2State = true;
      digitalWrite(LED2, HIGH);
      publishLedState(TOPIC_LED2_STATE, true);
    } else if (message == "OFF") {
      led2State = false;
      digitalWrite(LED2, LOW);
      publishLedState(TOPIC_LED2_STATE, false);
    }
  } else if (String(topic) == TOPIC_LED3_SET) {
    if (message == "ON") {
      led3State = true;
      digitalWrite(LED3, HIGH);
      publishLedState(TOPIC_LED3_STATE, true);
    } else if (message == "OFF") {
      led3State = false;
      digitalWrite(LED3, LOW);
      publishLedState(TOPIC_LED3_STATE, false);
    }
  } else if (String(topic) == TOPIC_LED_ALL_SET) {
    if (message == "ON") {
      led1State = true; led2State = true; led3State = true;
      digitalWrite(LED1, HIGH);
      digitalWrite(LED2, HIGH);
      digitalWrite(LED3, HIGH);
      publishLedState(TOPIC_LED1_STATE, true);
      publishLedState(TOPIC_LED2_STATE, true);
      publishLedState(TOPIC_LED3_STATE, true);
    } else if (message == "OFF") {
      led1State = false; led2State = false; led3State = false;
      digitalWrite(LED1, LOW);
      digitalWrite(LED2, LOW);
      digitalWrite(LED3, LOW);
      publishLedState(TOPIC_LED1_STATE, false);
      publishLedState(TOPIC_LED2_STATE, false);
      publishLedState(TOPIC_LED3_STATE, false);
    }
  }
}

// =====================================================
// KET NOI MQTT
// =====================================================
void connectMQTT() {
  while (!mqttClient.connected()) {
    // Duy tri xuat muc LOW cho tat ca cac den trong qua trinh doi MQTT
    digitalWrite(LED1, led1State ? HIGH : LOW);
    digitalWrite(LED2, led2State ? HIGH : LOW);
    digitalWrite(LED3, led3State ? HIGH : LOW);
    digitalWrite(LED_ALERT1, LOW);
    digitalWrite(LED_ALERT2, LOW);
    digitalWrite(LED_ALERT3, LOW);

    Serial.print("Dang ket noi MQTT...");
    String clientId = "ESP8266-";
    clientId += String(ESP.getChipId());

    bool connected;
    if (MQTT_USE_AUTH) {
      connected = mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASSWORD, TOPIC_DEVICE_STATUS, 0, true, "OFFLINE");
    } else {
      connected = mqttClient.connect(clientId.c_str(), TOPIC_DEVICE_STATUS, 0, true, "OFFLINE");
    }

    if (connected) {
      Serial.println("THANH CONG!");
      mqttClient.publish(TOPIC_DEVICE_STATUS, "ONLINE", true);
      mqttClient.subscribe(TOPIC_LED1_SET);
      mqttClient.subscribe(TOPIC_LED2_SET);
      mqttClient.subscribe(TOPIC_LED3_SET);
      mqttClient.subscribe(TOPIC_LED_ALL_SET);

      // Xuat gia tri mac dinh cho cac LED va gui trang thai ve broker
      digitalWrite(LED1, led1State ? HIGH : LOW);
      digitalWrite(LED2, led2State ? HIGH : LOW);
      digitalWrite(LED3, led3State ? HIGH : LOW);
      digitalWrite(LED_ALERT1, LOW);
      digitalWrite(LED_ALERT2, LOW);
      digitalWrite(LED_ALERT3, LOW);
      publishLedState(TOPIC_LED1_STATE, led1State);
      publishLedState(TOPIC_LED2_STATE, led2State);
      publishLedState(TOPIC_LED3_STATE, led3State);
    } else {
      Serial.print("THAT BAI, state = ");
      Serial.println(mqttClient.state());
      delay(2000);
    }
  }
}

// =====================================================
// SETUP
// =====================================================
void setup() {
  // Cau hinh ngay lap tuc tat ca cac chan LED o muc OUTPUT va xuat LOW mac dinh
  // de chong hien tuong sang lo mo / map mo do tro keo pullup tren GPIO0 (D3) hoac troi chan
  pinMode(LED1, OUTPUT);
  pinMode(LED2, OUTPUT);
  pinMode(LED3, OUTPUT);
  digitalWrite(LED1, LOW);
  digitalWrite(LED2, LOW);
  digitalWrite(LED3, LOW);

  pinMode(LED_ALERT1, OUTPUT);
  pinMode(LED_ALERT2, OUTPUT);
  pinMode(LED_ALERT3, OUTPUT);
  digitalWrite(LED_ALERT1, LOW);
  digitalWrite(LED_ALERT2, LOW);
  digitalWrite(LED_ALERT3, LOW);

  Serial.begin(115200);

  // Khoi tao random seed tu A0
  randomSeed(analogRead(A0) + ESP.getCycleCount());

  // Khoi dong DHT11
  dht.begin();

  // Ket noi WiFi & MQTT
  connectWiFi();
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setKeepAlive(5);
  mqttClient.setCallback(mqttCallback);

  // Dam bao tat ca cac den deu TAT HAN sau khi khoi dong xong
  digitalWrite(LED1, LOW);
  digitalWrite(LED2, LOW);
  digitalWrite(LED3, LOW);
  digitalWrite(LED_ALERT1, LOW);
  digitalWrite(LED_ALERT2, LOW);
  digitalWrite(LED_ALERT3, LOW);
  lastPublishReal = millis();
  lastPublishVirtual = millis();
}

// =====================================================
// LOOP
// =====================================================
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  if (!mqttClient.connected()) {
    connectMQTT();
  }

  mqttClient.loop();

  // 1. Xu ly nhap nhay khong dung delay (chu ky 300ms)
  unsigned long currentMillis = millis();
  if (currentMillis - lastBlinkTime >= 300) {
    lastBlinkTime = currentMillis;
    blinkState = !blinkState;

    // LED_ALERT1 (D3): Nhap nhay khi vuot nguong, nguoc lai luon ep LOW dut khoat
    if (isBlinking1) {
      digitalWrite(LED_ALERT1, blinkState ? HIGH : LOW);
    } else {
      digitalWrite(LED_ALERT1, LOW);
    }

    // LED_ALERT2 (D7)
    if (isBlinking2) {
      digitalWrite(LED_ALERT2, blinkState ? HIGH : LOW);
    } else {
      digitalWrite(LED_ALERT2, LOW);
    }

    // LED_ALERT3 (D8)
    if (isBlinking3) {
      digitalWrite(LED_ALERT3, blinkState ? HIGH : LOW);
    } else {
      digitalWrite(LED_ALERT3, LOW);
    }
  }

  // Duy tri xuat muc LOW dut khoat cho tat ca cac den khi o trang thai OFF
  // de chong tuyet doi hien tuong sang lo mo / map mo do tro keo hoac rò dien
  if (!led1State) digitalWrite(LED1, LOW);
  if (!led2State) digitalWrite(LED2, LOW);
  if (!led3State) digitalWrite(LED3, LOW);
  if (!isBlinking1) digitalWrite(LED_ALERT1, LOW);
  if (!isBlinking2) digitalWrite(LED_ALERT2, LOW);
  if (!isBlinking3) digitalWrite(LED_ALERT3, LOW);

  // 2. Doc cam bien that (DHT11 & LDR) dinh ky 2000ms (an toan tuyet doi cho DHT11)
  if (currentMillis - lastPublishReal >= 2000) {
    lastPublishReal = currentMillis;

    // --- A. Cảm biến thật (DHT11 & LDR) ---
    float temperature = dht.readTemperature();
    float humidity = dht.readHumidity();
    int lightValue = analogRead(LIGHT_PIN);

    if (!isnan(temperature) && !isnan(humidity)) {
      String jsonSensor = "{";
      jsonSensor += "\"temperature\":" + String(temperature, 1) + ",";
      jsonSensor += "\"humidity\":" + String(humidity, 1) + ",";
      jsonSensor += "\"light\":" + String(lightValue);
      jsonSensor += "}";
      mqttClient.publish(TOPIC_SENSOR_ALL, jsonSensor.c_str());
    }
  }

  // 3. Sinh 3 cam bien ao BTH4 & cap nhat den canh bao dinh ky 2000ms (Kich ban B: giu mau 2 giay, dong bo cuc nhanh voi Web)
  if (currentMillis - lastPublishVirtual >= 2000) {
    lastPublishVirtual = currentMillis;

    // --- B. 3 Cảm biến ảo BTH4 ---
    // CB1: 0 - 11
    // CB2: 0 - 101
    // CB3: 0 - 1001
    int valCB1 = random(0, 12);     // 0 đến 11
    int valCB2 = random(0, 102);    // 0 đến 101
    int valCB3 = random(0, 1002);   // 0 đến 1001
    // Switch each warning LED on when its value exceeds half of its maximum.
    isBlinking1 = (valCB1 > 5.5);
    isBlinking2 = (valCB2 > 50.5);
    isBlinking3 = (valCB3 > 500.5);

    // Dong goi JSON cam bien ao
    String jsonVirtual = "{";
    jsonVirtual += "\"cb1\":" + String(valCB1) + ",";
    jsonVirtual += "\"cb2\":" + String(valCB2) + ",";
    jsonVirtual += "\"cb3\":" + String(valCB3);
    jsonVirtual += "}";

    // Publish len topic iot/sensor/virtual
    mqttClient.publish(TOPIC_SENSOR_VIRTUAL, jsonVirtual.c_str());

    Serial.println();
    Serial.println("===== BTH4 VIRTUAL SENSORS =====");
    Serial.print("CB1 (0-11)     : "); Serial.print(valCB1);
    Serial.println(" -> Chi hien thi chi so");
    Serial.print("CB2 (0-101)    : "); Serial.print(valCB2);
    Serial.println(" -> Chi hien thi chi so");
    Serial.print("CB3 (0-1001)   : "); Serial.print(valCB3);
    Serial.print(" | LED D8 (CB1): "); Serial.print(isBlinking1 ? "ON" : "OFF");
    Serial.print(" | LED D7 (CB2): "); Serial.print(isBlinking2 ? "ON" : "OFF");
    Serial.print(" | LED D3 (CB3): "); Serial.println(isBlinking3 ? "ON" : "OFF");
  }
}
