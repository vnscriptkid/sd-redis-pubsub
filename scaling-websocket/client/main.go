package main

import (
	"log"

	"github.com/gin-gonic/gin"
)

func main() {
	r := gin.Default()

	// Define a route for the HTML file
	r.GET("/", func(c *gin.Context) {
		c.File("./index.html")
	})

	// Start the server
	if err := r.Run(":8080"); err != nil {
		log.Fatal(err)
	}
}
