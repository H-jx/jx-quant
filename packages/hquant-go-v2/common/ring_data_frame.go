
package common

import (
	"fmt"
	"sync"
	"time"
)

// DataFrameSchema defines the schema for the DataFrame.
type DataFrameSchema map[string]string // e.g., {"price": "float", "name": "string"}

// RingDataFrame is a column-oriented DataFrame using ring buffers.
type RingDataFrame struct {
	columns  map[string]interface{}
	capacity int
	length   int
	mutex    sync.RWMutex
}

// NewRingDataFrame creates a new RingDataFrame.
func NewRingDataFrame(schema DataFrameSchema, capacity int) (*RingDataFrame, error) {
	if capacity <= 0 {
		return nil, fmt.Errorf("capacity must be positive")
	}

	columns := make(map[string]interface{})
	for key, colType := range schema {
		switch colType {
		case "float", "int":
			columns[key] = NewTypedRingBuffer(capacity)
		case "string":
			columns[key] = NewCircularQueue(capacity)
		case "date":
			columns[key] = NewCircularQueue(capacity)
		default:
			return nil, fmt.Errorf("unsupported column type: %s", colType)
		}
	}

	return &RingDataFrame{
		columns:  columns,
		capacity: capacity,
	}, nil
}

// Push appends a row to the DataFrame.
func (rdf *RingDataFrame) Push(row map[string]interface{}) error {
	rdf.mutex.Lock()
	defer rdf.mutex.Unlock()

	for key, col := range rdf.columns {
		val, ok := row[key]
		if !ok {
			// Handle missing values, e.g., push a zero or empty string
			val = nil // Or a default value based on type
		}

		switch c := col.(type) {
		case *TypedRingBuffer:
			if v, ok := val.(float64); ok {
				c.Push(v)
			} else if v, ok := val.(int); ok {
				c.Push(float64(v))
			} else {
				c.Push(0) // Default for missing/invalid numbers
			}
		case *CircularQueue:
			if v, ok := val.(string); ok {
				c.Push(v)
			} else if v, ok := val.(time.Time); ok {
				c.Push(v)
			} else if val == nil {
				c.Push(nil) // Push nil for missing values
			} else {
				c.Push(fmt.Sprintf("%v", val)) // Convert to string
			}
		}
	}

	if rdf.length < rdf.capacity {
		rdf.length++
	}

	return nil
}

// GetRow returns a row at the specified index.
func (rdf *RingDataFrame) GetRow(index int) (map[string]interface{}, error) {
	rdf.mutex.RLock()
	defer rdf.mutex.RUnlock()

	if index < 0 || index >= rdf.length {
		return nil, fmt.Errorf("index out of bounds")
	}

	row := make(map[string]interface{})
	for key, col := range rdf.columns {
		switch c := col.(type) {
		case *TypedRingBuffer:
			row[key] = c.Get(index)
		case *CircularQueue:
			row[key] = c.Get(index)
		}
	}
	return row, nil
}

// UpdateRow updates a row at the specified index.
func (rdf *RingDataFrame) UpdateRow(index int, row map[string]interface{}) error {
	rdf.mutex.Lock()
	defer rdf.mutex.Unlock()

	if index < 0 || index >= rdf.length {
		return fmt.Errorf("index out of bounds")
	}

	for key, col := range rdf.columns {
		val, ok := row[key]
		if !ok {
			val = nil
		}

		switch c := col.(type) {
		case *TypedRingBuffer:
			if v, ok := val.(float64); ok {
				c.Update(index, v)
			} else if v, ok := val.(int); ok {
				c.Update(index, float64(v))
			} else {
				c.Update(index, 0) // Default for missing/invalid numbers
			}
		case *CircularQueue:
			if v, ok := val.(string); ok {
				c.Update(index, v)
			} else if v, ok := val.(time.Time); ok {
				c.Update(index, v)
			} else if val == nil {
				c.Update(index, nil) // Update with nil
			} else {
				c.Update(index, fmt.Sprintf("%v", val)) // Convert to string
			}
		}
	}
	return nil
}

// Length returns the current number of rows in the DataFrame.
func (rdf *RingDataFrame) Length() int {
	rdf.mutex.RLock()
	defer rdf.mutex.RUnlock()
	return rdf.length
}

// Clear clears the DataFrame.
func (rdf *RingDataFrame) Clear() {
	rdf.mutex.Lock()
	defer rdf.mutex.Unlock()
	for _, col := range rdf.columns {
		switch c := col.(type) {
		case *TypedRingBuffer:
			c.Clear()
		case *CircularQueue:
			c.Clear()
		}
	}
	rdf.length = 0
}
