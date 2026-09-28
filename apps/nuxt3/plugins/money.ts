import { definePayloadPlugin, definePayloadReducer, definePayloadReviver } from '#imports'
import { Money } from '../utils/money'

export default definePayloadPlugin(() => {
  definePayloadReducer('Money', value => value instanceof Money && [value.amount, value.currency])
  definePayloadReviver('Money', (value) => {
    if (!Array.isArray(value) || typeof value[0] !== 'number' || typeof value[1] !== 'string')
      throw new Error('Money 数据格式错误')
    return new Money(value[0], value[1])
  })
})
