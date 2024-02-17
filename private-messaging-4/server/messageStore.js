/* abstract */ class MessageStore {
    saveMessage(message) {}
    findMessagesForUser(userID) {}
  }
  
  class InMemoryMessageStore extends MessageStore {
    constructor() {
      super();
      this.messages = [];
    }
  
    saveMessage(message) {
      this.messages.push(message);
      console.log('messages: ', this.messages)
    }
  
    findMessagesForUser(userID) {
      return this.messages.filter(
        ({ from, to }) => from === userID || to === userID
      );
    }
  }

  const CONVERSATION_TTL = 60 * 60 * 24 * 7; // 1 week
  class RedisMessageStore extends MessageStore {
    constructor(redisClient) {
      super();
      this.redisClient = redisClient;
    }
  
    // multi() is used to execute a series of commands atomically
    /*
      Example: 
      messages:john = [ { content: 'Hello', from: 'john', to: 'jane' } ]
      messages:jane = [ { content: 'Hello', from: 'john', to: 'jane' } ]

      So basically `messages:x` stores all  
      (1) messages from user x to any other user
      (2) messages from any other user to user x
    */
    saveMessage(message) {
      const value = JSON.stringify(message);
      this.redisClient
        .multi()
        .rpush(`messages:${message.from}`, value)
        .rpush(`messages:${message.to}`, value)
        .expire(`messages:${message.from}`, CONVERSATION_TTL)
        .expire(`messages:${message.to}`, CONVERSATION_TTL)
        .exec();
    }
  
    findMessagesForUser(userID) {
      return this.redisClient
        .lrange(`messages:${userID}`, 0, -1)
        .then((results) => {
          return results.map((result) => JSON.parse(result));
        });
    }
  }
  
  module.exports = {
    InMemoryMessageStore,
    RedisMessageStore
  };