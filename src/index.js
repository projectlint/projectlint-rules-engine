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
module.exports = function(validators, rules)
{
  // Normalize validators
  if(!validators) throw new SyntaxError('`validators` argument must be set')

  if(!Array.isArray(validators)) validators = Object.entries(validators)

  if(!validators.length) throw new SyntaxError('No `validators` are defined')

  // Normalize rules
  if(!rules) throw new SyntaxError('`rules` argument must be set')

  if(Array.isArray(rules)) rules = rules.reduce(reduceRules, {})

  if(!Object.keys(rules).length) throw new SyntaxError('No `rules` are defined')

  // Filter rules
  // TODO enable parent rules with default options when not set explicitly
  let filteredRules = validators.filter(filterRules, Object.keys(rules))
  if(!filteredRules.length) throw new SyntaxError('No rules are enabled')

  // Set dependencies between rules, apply them and check for cycles
  const visited = {}

  while(filteredRules.length)
  {
    const filteredRulesNext = []

    for(const entry of filteredRules)
    {
      const [name, {run}] = entry
      let [, {dependsOn}] = entry

      if(typeof dependsOn === 'string') dependsOn = [dependsOn]

      async function runValidator()
      {
        let result

        try
        {
          result = await run(rules[name])
        }
        catch(error)
        {
          throw {dependsOn, error, name}
        }

        return {dependsOn, name, result}
      }

      // Rule is one of the root ones, process it without dependencies
      if(!dependsOn?.length)
      {
        visited[name] = runValidator()
        continue
      }

      // Rule has dependencies pending to be procesed, add to the next iteration
      if(!dependsOn.every(mapVisited, visited))
      {
        filteredRulesNext.push(entry)
        continue
      }

      // Process rule
      visited[name] = Promise.allSettled(dependsOn.map(mapVisited, visited))
        .then(function(results)
        {
          // Some dependencies has failed, we can't run
          if(results.some(isRejected)) throw {dependsOn, name, unsatisfied: true}

          return runValidator()
        })
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
    const error = new SyntaxError('Circular reference between enabled rules')

    error.rules = filteredRules.map(getEntryName)

    promises.unshift(Promise.reject({error}))
  }

  return promises
}
