
// from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set#Implementing_basic_set_operations

export function isSuperset<T>(set: Set<T>, subset: Set<T>) {
  for (let elem of subset) {
      if (!set.has(elem)) {
          return false
      }
  }
  return true
}

export function union<T>(setA: Set<T>, setB: Set<T>) {
  let _union = new Set(setA)
  for (let elem of setB) {
      _union.add(elem)
  }
  return _union
}

export function intersection<T>(setA: Set<T>, setB: Set<T>) {
  let _intersection = new Set()
  for (let elem of setB) {
      if (setA.has(elem)) {
          _intersection.add(elem)
      }
  }
  return _intersection
}

export function symmetricDifference<T>(setA: Set<T>, setB: Set<T>) {
  let _difference = new Set(setA)
  for (let elem of setB) {
      if (_difference.has(elem)) {
          _difference.delete(elem)
      } else {
          _difference.add(elem)
      }
  }
  return _difference
}

export function difference<T>(setA: Set<T>, setB: Set<T>) {
  let _difference = new Set(setA)
  for (let elem of setB) {
      _difference.delete(elem)
  }
  return _difference
}
