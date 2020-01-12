class Unsatisfied extends Error
{
  name = 'Unsatisfied'
}


function expandRules(value)
{
  const {filteredRules, validators} = this

  if(Array.isArray(value))
    return value.forEach(expandRules, this)

  if(value.constructor.name === 'Object')
    return Object.entries(value).forEach(expandRules_forEntries, this)

  const rule = validators.find(findValidator_byName, value)

  if(!rule) throw new SyntaxError(`'${value}' rule not found`)

  return filteredRules.find(findValidator_byName, value)
  || filteredRules.push(rule)
}

function expandRules_forEntries([key, value])
{
  expandRules.call(this, value === true ?  key : value)
}

function filterRules([name])
{
  return this.includes(name)
}

function findValidator_byName([name])
{
  return this.toString() === name
}

function flatKeys(value)
{
  if(value == null) return []

  if(Array.isArray(value)) return value.flatMap(flatKeys)

  if(value.constructor.name === 'Object')
    return Object.entries(value).flatMap(flatMap_forEntries)

  return [value]
}

function flatMap_forEntries([key, value])
{
  return [key, flatKeys(value === true ?  key : value)]
}

function getEntryName([name])
{
  return name
}

function getDependsOn([, {dependsOn}])
{
  return dependsOn
}

function getValue({value})
{
  return value
}

function isRejected({status})
{
  return status === 'rejected'
}

function mapVisited(name)
{
  return this[name]
}

function reduceRules(rules, name)
{
  rules[name] = undefined

  return rules
}


/**
 * @return {Object.<string, Promise>}
 *
 * @throw {SyntaxError} arguments are incorrect
 */
module.exports = function(
  validators,
  rules,
  {context, shortcircuit_and, shortcircuit_or} = {}
) {
  // Normalize validators
  if(!validators) throw new SyntaxError('`validators` argument must be set')

  if(!Array.isArray(validators)) validators = Object.entries(validators)

  if(!validators.length) throw new SyntaxError('No `validators` are defined')

  // Normalize rules
  if(!rules) throw new SyntaxError('`rules` argument must be set')

  if(typeof rules === 'string') rules = [rules]

  if(Array.isArray(rules)) rules = rules.reduce(reduceRules, {})

  if(!Object.keys(rules).length) throw new SyntaxError('No `rules` are defined')

  // Filter rules
  let filteredRules = validators.filter(filterRules, Object.keys(rules))
  if(!filteredRules.length) throw new SyntaxError('No rules are enabled')

  // Expand filtered rules
  filteredRules.map(getDependsOn).filter(Boolean)
  .forEach(expandRules, {filteredRules, validators})

  // Set dependencies between rules, apply them and check for cycles

  function processDependencies(dependencies)
  {
    // Rule is one of the root ones, process it without dependencies
    if(!dependencies) return Promise.resolve()

    if(Array.isArray(dependencies))
    {
      const promises = dependencies.map(processDependencies, this)

      if(shortcircuit_and) return Promise.all(promises)

      return Promise.allSettled(promises)
      .then(function(results)
      {
        // Some dependencies has failed, we can't exec function
        if(results.some(isRejected)) throw new Unsatisfied()

        return results.map(getValue)
      })
    }

    if(dependencies.constructor.name === 'Object')
    {
      if(shortcircuit_or)
        return Promise.any(Object.entries(dependencies).map(mapEntries, this))

      const keys = Object.keys(dependencies)
      const promises = Object.entries(dependencies)
      .map(processDependencies_forEntries, this)

      return Promise.allSettled(promises)
      .then(function(results)
      {
        // All dependencies has failed, we can't exec function
        if(results.every(isRejected)) throw new Unsatisfied()

        return results.reduce(function(acum, dependency, index)
        {
          if(dependency.hasOwnProperty('value'))
            acum[keys[index]] = dependency.value

          return acum
        }, {})
      })
    }

    return visited[dependencies]
    .catch(function()
    {
      // Dependencies has failed, we can't exec function
      throw new Unsatisfied()
    })
  }

  function processDependencies_forEntries([key, value])
  {
    return processDependencies.call(this, value === true ?  key : value)
  }

  function mapEntries(entry)
  {
    return processDependencies_forEntries.call(this, entry)
    .then(function(value)
    {
      return {[entry[0]]: value}
    })
  }

  // Check for circular references
  let visited = {}

  while(filteredRules.length)
  {
    const filteredRulesNext = []

    for(const entry of filteredRules)
    {
      const [ruleName, rule] = entry

      if(flatKeys(rule.dependsOn).every(mapVisited, visited))
        visited[ruleName] = rule

      // Rule has dependencies pending to be procesed, add to the next iteration
      else
        filteredRulesNext.push(entry)
    }

    // There are circular references, don't process more rules
    if(filteredRules.length === filteredRulesNext.length)
    {
      const rules = filteredRules.map(getEntryName)

      const error = new SyntaxError(`Circular reference between rules '${rules}'`)

      error.rules = rules

      throw error
    }

    filteredRules = filteredRulesNext
  }

  // Process rules
  filteredRules = Object.entries(visited)
  visited = {}

  while(filteredRules.length)
  {
    const filteredRulesNext = []

    for(const entry of filteredRules)
    {
      const [ruleName, {dependsOn, func}] = entry

      // Rule has dependencies pending to be procesed, add to the next iteration
      if(!flatKeys(dependsOn).every(mapVisited, visited))
      {
        filteredRulesNext.push(entry)
        continue
      }

      visited[ruleName] = processDependencies.call(ruleName, dependsOn)
      .then(async function(dependencies)
      {
        return func(context, dependencies, rules[ruleName])
      })
    }

    filteredRules = filteredRulesNext
  }

  // Return rules results
  return visited
}
