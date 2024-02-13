up:
	docker compose up -d

down:
	docker compose down --remove-orphans --volumes

cli:
	docker exec -it rpubsub redis-cli
