#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <MFRC522.h>

// WiFi Configuration
#define WIFI_SSID "YourWiFiSSID"
#define WIFI_PASS "YourWiFiPassword"

// MQTT Configuration
#define MQTT_HOST "broker.benax.rw"
#define MQTT_PORT 1883
#define TEAM_ID "y2c_team0125"
#define CLIENT_ID "rfid_device_y2c_team0125"

// MQTT Topics
#define TOPIC_STATUS "rfid/y2c_team0125/card/status"
#define TOPIC_TOPUP "rfid/y2c_team0125/card/topup"
#define TOPIC_PAY "rfid/y2c_team0125/card/pay"
#define TOPIC_BALANCE "rfid/y2c_team0125/card/balance"

// RFID Pins
#define SS_PIN 2  // D4 on NodeMCU
#define RST_PIN 0 // D3 on NodeMCU

MFRC522 rfid(SS_PIN, RST_PIN);

// LED Pin
#define LED_PIN 2 // Built-in LED

WiFiClient espClient;
PubSubClient client(espClient);

String lastUID = "";
int balance = 0;
unsigned long lastCardRead = 0;
const unsigned long cardReadDelay = 2000; // Prevent double reads

void connectWiFi()
{
    Serial.print("Connecting to WiFi");
    WiFi.begin(WIFI_SSID, WIFI_PASS);

    while (WiFi.status() != WL_CONNECTED)
    {
        delay(500);
        Serial.print(".");
    }

    Serial.println("\nWiFi connected");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
}

void mqttCallback(char *topic, byte *payload, unsigned int length)
{
    String message;
    for (unsigned int i = 0; i < length; i++)
    {
        message += (char)payload[i];
    }

    StaticJsonDocument<200> doc;
    DeserializationError error = deserializeJson(doc, message);

    if (error)
    {
        Serial.println("JSON parsing failed");
        return;
    }

    String uid = doc["uid"];
    int amount = doc["amount"];

    // Only process if it's the last detected card
    if (uid == lastUID)
    {
        String topicStr = String(topic);

        if (topicStr == TOPIC_TOPUP)
        {
            // Top-up operation
            balance += amount;
            Serial.printf("Top-up: +%d RWF\n", amount);
        }
        else if (topicStr == TOPIC_PAY)
        {
            // Payment operation
            if (balance >= amount)
            {
                balance -= amount;
                Serial.printf("Payment: -%d RWF\n", amount);
            }
            else
            {
                Serial.println("Insufficient balance for payment");
                return; // Don't publish balance update
            }
        }

        // Publish updated balance
        StaticJsonDocument<200> out;
        out["uid"] = uid;
        out["new_balance"] = balance;

        char buffer[256];
        size_t n = serializeJson(out, buffer);
        client.publish(TOPIC_BALANCE, buffer, n);

        // Visual feedback
        digitalWrite(LED_PIN, HIGH);
        delay(200);
        digitalWrite(LED_PIN, LOW);
    }
}

void connectMQTT()
{
    client.setServer(MQTT_HOST, MQTT_PORT);
    client.setCallback(mqttCallback);

    while (!client.connected())
    {
        Serial.print("Connecting to MQTT...");
        if (client.connect(CLIENT_ID))
        {
            Serial.println("connected");
            client.subscribe(TOPIC_TOPUP);
            client.subscribe(TOPIC_PAY);
            Serial.println("Subscribed to topics");
        }
        else
        {
            Serial.print("failed, rc=");
            Serial.print(client.state());
            Serial.println(" retrying in 2 seconds");
            delay(2000);
        }
    }
}

void setup()
{
    Serial.begin(115200);
    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, HIGH); // LED off (active low)

    SPI.begin();
    rfid.PCD_Init();

    Serial.println("\nRFID Wallet System Starting...");
    connectWiFi();
    connectMQTT();

    Serial.println("System Ready! Place card on reader.");
}

void loop()
{
    if (!client.connected())
    {
        connectMQTT();
    }
    client.loop();

    // Check for new card
    if (millis() - lastCardRead > cardReadDelay && rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial())
    {

        // Convert UID to string
        String uid = "";
        for (byte i = 0; i < rfid.uid.size; i++)
        {
            if (rfid.uid.uidByte[i] < 0x10)
                uid += "0";
            uid += String(rfid.uid.uidByte[i], HEX);
        }
        uid.toUpperCase();

        // Update last UID
        lastUID = uid;
        lastCardRead = millis();

        // Publish card status
        StaticJsonDocument<200> doc;
        doc["uid"] = uid;
        doc["balance"] = balance;

        char buffer[256];
        size_t n = serializeJson(doc, buffer);

        if (client.publish(TOPIC_STATUS, buffer, n))
        {
            Serial.print("Card detected: ");
            Serial.print(uid);
            Serial.print(" | Balance: ");
            Serial.print(balance);
            Serial.println(" RWF");

            digitalWrite(LED_PIN, LOW); // LED on
            delay(200);
            digitalWrite(LED_PIN, HIGH); // LED off
        }
        else
        {
            Serial.println("Failed to publish card status");
        }

        // Halt PICC
        rfid.PICC_HaltA();
    }
}