function expandRules(value)
{
  const {filteredRules, validators} = this

  if(typeof value === 'string')
  {
    const rule = validators.find(findValidator_byName, value)

    if(!rule) throw new SyntaxError(`'${value}' rule not found`)

    return filteredRules.find(findValidator_byName, value)
    || filteredRules.push(rule)
  }

  if(Array.isArray(value))
    return value.forEach(expandRules, this)

  if(value.constructor.name === 'Object')
    return Object.entries(value).forEach(expandRules_forEntries, this)

  throw new SyntaxError(`Unknown type for value '${value}'`)
}

function expandRules_forEntries([key, value])
{
  expandRules.call(this, value || key)
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
  if(value === undefined) return []

  if(Array.isArray(value)) return value.flatMap(flatKeys)

  if(value.constructor.name === 'Object')
    return Object.entries(value).flatMap(flatMap_forEntries)

  return [value]
}

function flatMap_forEntries([key, value])
{
  return [key, flatKeys(value)]
}

function getEntryName([name])
{
  return name
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

function normalizeFilteredRules([, value], _, filteredRules)
{
  let {dependsOn} = value

  if(!dependsOn) return

  // // Normalize dependencies
  // if(typeof dependsOn === 'string') value.dependsOn = dependsOn = [dependsOn]

  // Expand rules
  expandRules.call({filteredRules, validators: this}, dependsOn)
}

function reduceRules(rules, name)
{
  rules[name] = undefined

  return rules
}


/**
 * @return {Array.<Promise>}
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

  // Normalize and expand filtered rules
  filteredRules.forEach(normalizeFilteredRules, validators)

  // Set dependencies between rules, apply them and check for cycles
  const visited = {}

  function processDependencies(dependencies)
  {
    const name = this.toString()

    // Rule is one of the root ones, process it without dependencies
    if(!dependencies) return Promise.resolve()

    if(typeof dependencies === 'string') return visited[dependencies]
    .catch(function()
    {
      throw {dependsOn: dependencies, name, unsatisfied: true}
    })

    if(Array.isArray(dependencies))
    {
      const promises = dependencies.map(processDependencies, this)

      if(shortcircuit_and) return Promise.all(promises)

      return Promise.allSettled(promises)
      .then(function(dependsOn)
      {
        // Some dependencies has failed, we can't run
        if(dependsOn.some(isRejected))
          throw {dependsOn, name, unsatisfied: true}

        return dependsOn.map(getValue)
      })
    }

    if(dependencies.constructor.name === 'Object')
    {
      if(shortcircuit_or)
      {
        const promises = Object.entries(dependencies).map(mapEntries, this)

        return Promise.any(promises)
      }

      const keys = Object.keys(dependencies)
      const promises = Object.entries(dependencies)
      .map(processDependencies_forEntries, this)

      return Promise.allSettled(promises)
      .then(function(dependsOn)
      {
        // Some dependencies has failed, we can't run
        if(dependsOn.every(isRejected))
          throw {dependsOn, name, unsatisfied: true}

        return dependsOn.reduce(function(acum, dependency, index)
        {
          if(dependency.hasOwnProperty('value'))
            acum[keys[index]] = dependency.value

          return acum
        }, {})
      })
    }

    throw new SyntaxError(`Unknown type for dependencies '${dependencies}'`)
  }

  function processDependencies_forEntries([key, value])
  {
    return processDependencies.call(this, value === true ?  key : value)
  }

  function mapEntries([key, value])
  {
    return processDependencies.call(this, value)
    .then(function(value)
    {
      return {[key]: value}
    })
  }

  while(filteredRules.length)
  {
    const filteredRulesNext = []

    for(const entry of filteredRules)
    {
      const [name, {dependsOn, run}] = entry

      async function runValidator(dependencies)
      {
        let result

        try
        {
          result = await run(context, dependencies, rules[name])
        }
        catch(error)
        {
          throw {dependsOn, error, name}
        }

        return {dependsOn, name, result}
      }

      if(flatKeys(dependsOn).every(mapVisited, visited))
        visited[name] = processDependencies.call(name, dependsOn)
        .then(runValidator)

      // Rule has dependencies pending to be procesed, add to the next iteration
      else
        filteredRulesNext.push(entry)
    }

    // There are circular references, don't process more rules
    if(filteredRules.length === filteredRulesNext.length) break

    filteredRules = filteredRulesNext
  }

  // Return rules results
  const promises = Object.values(visited)

  // If there was circular references, force to set validation as failed to
  // notify to the user since we have already started procesing other rules
  if(filteredRules.length)
  {
    const rules = filteredRules.map(getEntryName)

    const error = new SyntaxError(`Circular reference between rules '${rules}'`)

    error.rules = rules

    promises.unshift(Promise.reject({error}))
  }

  return promises
}
