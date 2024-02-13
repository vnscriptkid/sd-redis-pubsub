package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/gorilla/websocket"
)

var (
	REDIS_HOST  = os.Getenv("REDIS_HOST")
	REDIS_PORT  = os.Getenv("REDIS_PORT")
	SERVER_NAME = os.Getenv("SERVER_NAME")
)

var redisClient *redis.Client
var ctx = context.Background()
var wsupgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// check the origin of the request and return true if it's
		// from a trusted domain
		// if r.Header.Get("Origin") == "http://trusted.domain.com" {
		//     return true
		// }
		// return false
		return true
	},
}
var clients = make(map[string]*websocket.Conn)
var clientMtx = sync.Mutex{}

type User struct {
	ID string `json:"id"`
}

type Message struct {
	Sender    User   `json:"sender"`
	Recipient User   `json:"recipient"`
	Text      string `json:"text"`
}

func main() {

	redisClient = redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%s", REDIS_HOST, REDIS_PORT), // replace with your Redis server address
		Password: "",                                           // no password set
		DB:       0,                                            // use default DB
	})

	router := gin.Default()
	router.GET("/ws/:id", handleWebSocketConnection)
	router.GET("/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"message": "pong",
		})
	})
	router.Run("0.0.0.0:8080") // replace with your server address
}

func handleWebSocketConnection(c *gin.Context) {
	conn, err := wsupgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Fatal("Failed to set websocket upgrade:", err)
		return
	}

	// Register server as subscriber to Redis channel `user.ID`
	user := User{ID: c.Param("id")}
	pubsub := redisClient.Subscribe(ctx, user.ID)

	// Save connection to clients map {userID:conn}
	clientMtx.Lock()
	clients[user.ID] = conn
	clientMtx.Unlock()

	log.Printf("[%s] user %s is connected", SERVER_NAME, user.ID)

	go handleSocketMessage(conn, pubsub)
	go listenForPubsubMessages(conn, pubsub)
}

func handleSocketMessage(conn *websocket.Conn, pubsub *redis.PubSub) {
	defer conn.Close()
	for {
		_, messageBytes, err := conn.ReadMessage()
		if err != nil {
			log.Println("Error on read message", err)
			return
		}

		var message Message
		err = json.Unmarshal(messageBytes, &message)
		if err != nil {
			log.Println("Error on unmarshal message", err)
			return
		}

		fmt.Printf("[%s] Received socket message: %+v\n", SERVER_NAME, message)

		// Check if recipient is connected to server

		recipientID := message.Recipient.ID

		// Check if recipient is connected to current server
		// If yes broadcast message to recipient via socket
		// Else likely recipient is connecting to another server, publish message to Redis pubsub channel `recipientID`
		if recipientConn, ok := clients[recipientID]; ok {
			fmt.Printf("[%s] 1. Recipient %s is CONNECTED to server\n", SERVER_NAME, recipientID)
			err = recipientConn.WriteJSON(message)
			if err != nil {
				log.Println("Error on write message", err)
				continue
			}
			fmt.Printf("[%s] 2. Message sent to recipient %s\n", SERVER_NAME, recipientID)
		} else {
			fmt.Printf("[%s] 1. Recipient %s is NOT connected to server\n", SERVER_NAME, recipientID)
			err = redisClient.Publish(ctx, recipientID, string(messageBytes)).Err()
			if err != nil {
				log.Println("Error on publish message", err)
				continue
			}
			fmt.Printf("[%s] 2. Message published to redis channel (%s)\n", SERVER_NAME, recipientID)
		}
	}
}

func listenForPubsubMessages(conn *websocket.Conn, pubsub *redis.PubSub) {
	ch := pubsub.Channel()

	for msg := range ch {
		message := &Message{}
		err := json.Unmarshal([]byte(msg.Payload), message)
		if err != nil {
			log.Println("Error on unmarshal message", err)
			return
		}

		fmt.Printf("[%s] From pubsub channel (%s) >>> Received message: %+v\n", SERVER_NAME, msg.Channel, message)

		err = conn.WriteJSON(message)
		if err != nil {
			log.Println("Error on write message", err)
			return
		}
	}
}
