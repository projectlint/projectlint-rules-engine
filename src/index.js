function filterRules([name])
{
  return this.includes(name)
}

function getEntryName([name])
{
  return name
}

function isRejected({status})
{
  return status === 'rejected'
}

function mapVisited(name)
{
  return this[name]
}

function normalizeArguments(validators, rules)
{
  // validators
  if(!validators) throw new SyntaxError('`validators` must be set')

  if(!Array.isArray(validators)) validators = Object.entries(validators)

  if(!validators.length) throw new SyntaxError('No `validators` are defined')

  // rules
  if(!rules) throw new SyntaxError('`rules` must be set')
  if(!rules.length) throw new SyntaxError('No `rules` are defined')

  if(Array.isArray(rules)) rules = rules.reduce(reduceRules, {})

  return [validators, rules]
}

function reduceRules(rules, name)
{
  rules[name] = undefined

  return rules
}


module.exports = function(validators, rules)
{
  // Normalize arguments
  try {
    [validators, rules] = normalizeArguments(validators, rules)
  } catch(error)
  {
    return Promise.reject(error)
  }

  // Filter rules
  let filteredRules = validators.filter(filterRules, Object.keys(rules))

  let {length} = filteredRules
  if(!length) return Promise.reject(new SyntaxError('No rules are enabled'))

  // Set dependencies between rules, apply them and check for cycles
  const visited = {}

  while(length)
  {
    const filteredRulesNext = []

    for(const entry of filteredRules)
    {
      const [name, {dependsOn, run}] = entry

      function runValidator()
      {
        return run(rules[name])
        .then(function(result)
        {
          return {dependsOn, name, result}
        },
        function(error)
        {
          throw {dependsOn, error, name}
        })
      }

      // Rule is one of the root ones, process it without dependencies
      if(!dependsOn?.length)
      {
        visited[name] = runValidator()
        continue
      }

      // Rule has dependencies pending to be procesed, add to the next iteration
      if(!dependsOn.every(visited.includes.bind(visited)))
      {
        filteredRulesNext.push(entry)
        continue
      }

      // Process rule
      visited[name] = Promise.allSettled(dependsOn.map(mapVisited, visited))
        .then(function(results)
        {
          // Some dependencies has failed, we can't run
          if(result.some(isRejected)) throw {dependsOn, name, unsatisfied: true}

          return runValidator()
        })
    }

    // There are circular references, don't process more rules
    if(length === filteredRulesNext.length) break

    filteredRules = filteredRulesNext
    ({length} = filteredRules)
  }

  // Return rules results
  const promises = Object.values(visited)

  // If there was circular references, force to set validation as failed to
  // notify to the user since we have already started procesing other rules
  if(filteredRules.length)
  {
    const error = new SyntaxError('Circular reference between enabled rules')

    error.rules = filteredRules.map(getEntryName)

    promises.unshift(Promise.reject({error}))
  }

  return promises
}
