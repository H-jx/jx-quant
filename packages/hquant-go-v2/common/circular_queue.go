
package common

import "sync"

// CircularQueue is a circular queue for Kline data.
type CircularQueue struct {
	data []interface{}
	maxSize int
	front   int
	rear    int
	mutex   sync.RWMutex
}

// NewCircularQueue creates a new CircularQueue.
func NewCircularQueue(maxSize int) *CircularQueue {
	return &CircularQueue{
		data:    make([]interface{}, maxSize),
		maxSize: maxSize,
	}
}

// Push adds an item to the queue.
func (c *CircularQueue) Push(item interface{}) {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	if c.rear == c.front && c.data[c.front] != nil {
		c.front = (c.front + 1) % c.maxSize
	}
	c.data[c.rear] = item
	c.rear = (c.rear + 1) % c.maxSize
}

// Get returns an item from the queue at a specific index.
func (c *CircularQueue) Get(index int) interface{} {
	c.mutex.RLock()
	defer c.mutex.RUnlock()

	i := (c.front + index) % c.maxSize
	return c.data[i]
}

// Update updates an item at a specific index.
func (c *CircularQueue) Update(index int, item interface{}) {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	i := (c.front + index) % c.maxSize
	c.data[i] = item
}

// Size returns the number of items in the queue.
func (c *CircularQueue) Size() int {
	c.mutex.RLock()
	defer c.mutex.RUnlock()

	if c.data[0] == nil {
		return 0
	}
	if c.front >= c.rear {
		return c.maxSize - c.front + c.rear
	} 
	return c.rear - c.front
	
}

func (c *CircularQueue) Clear() {
	c.mutex.Lock()
	defer c.mutex.Unlock()
	c.data = make([]interface{}, c.maxSize)
	c.front = 0
	c.rear = 0
}

// ToArray returns the queue as a slice.
func (c *CircularQueue) ToArray() []interface{} {
	c.mutex.RLock()
	defer c.mutex.RUnlock()

	result := make([]interface{}, c.Size())
	for i := 0; i < c.Size(); i++ {
		result[i] = c.Get(i)
	}
	return result
}
