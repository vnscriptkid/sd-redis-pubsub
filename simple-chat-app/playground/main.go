package main

import "fmt"

func main() {
	ch1 := make(chan int)
	ch2 := make(chan int)

	go func() {
		ch1 <- 1
	}()

	go func() {
		ch2 <- 2
	}()

	for {
		select {
		case <-ch1:
			fmt.Println("Received from ch1")
		case <-ch2:
			fmt.Println("Received from ch2")
		default:
			fmt.Println("No channel ready")
		}
	}
}
