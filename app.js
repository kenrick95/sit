var express = require('express')
var app = express()
var Promise = require('bluebird')
var request = require('request')
var async = require('asyncawait/async')
var await_ = require('asyncawait/await')
var pad = require('underscore.string/pad')
var NodeCache = require('node-cache')

var cache = new NodeCache()
var port = parseInt(process.env.PORT, 10)
if (isNaN(port)) {
  port = 80
}
var baseRequest = request.defaults({
  headers: {
    'User-Agent': 'KenrickTool/sit (https://tools.wmflabs.org/sit/; http://github.com/kenrick95/sit)'
  }
})
baseRequest = Promise.promisifyAll(baseRequest)

// polyfill
if (!String.prototype.startsWith) {
  String.prototype.startsWith = function (searchString, position) { // eslint-disable-line no-extend-native
    position = position || 0
    return this.substr(position, searchString.length) === searchString
  }
}

// for a given date period 'start' till 'end',
//     determine what is a trending topic on Wikipedia

const MILLISECONDS_IN_DAY = 86400000
const NUMBER_OF_DAYS = 14
const SITEINFO_TTL = 3600 // seconds

app.set('view engine', 'pug')

app.use('/sit/static/chart.js', express.static('node_modules/chart.js/dist'))
app.use('/sit/static/randomcolor', express.static('node_modules/randomcolor'))
app.use('/sit/static', express.static('views/js'))

var validProjects = []
var updateValidProjects = async(function () {
  var response = await_(baseRequest.getAsync('https://meta.wikimedia.org/w/api.php?action=sitematrix&format=json'))
  if (response.statusCode === 200) {
    response = JSON.parse(response.body)
    validProjects = []
    for (var key in response.sitematrix) {
      if (response.sitematrix.hasOwnProperty(key)) {
        if (key === 'count' || key === 'specials') {
          continue
        }
        response.sitematrix[key].site.forEach(function (project) {
          validProjects.push(project.url.replace(/https?:\/\//, ''))
        })
      }
    }
    console.log('Updated valid projects')
  }
})
updateValidProjects()

var processDay = async(function (project, year, month, date) {
  var cacheKey = JSON.stringify({'project': project, 'year': year, 'month': month, 'date': date})
  var cacheValue = cache.get(cacheKey)
  if (cacheValue === undefined) {
    var response = await_(baseRequest.getAsync('https://wikimedia.org/api/rest_v1/metrics/pageviews/top/' + project + '/all-access/' + year + '/' + month + '/' + date))
    if (response.statusCode === 200) {
      response = JSON.parse(response.body)
      var items = response.items
      var resultDate = items[0].year + '-' + items[0].month + '-' + items[0].day
      console.log('processDay ' + project + ' - ' + resultDate + ' done')

      cache.set(cacheKey, items[0].articles)
      return items[0].articles
    }
    return []
  }
  console.log('processDay ' + project + ' cache hit')
  return cacheValue
})

app.get('/sit/:project/until/:endTime', async(function (req, res, next) {
  var endTime = (new Date(req.params.endTime)).getTime()
  var articleCountByDay = {}
  var project = req.params.project.replace(/[^a-z.-]/g, '')
  var resultDates = []
  var key = null
  var item = null
  var err = null

  if (validProjects.indexOf(project) === -1) {
    err = new Error('Invalid project')
    err.status = 404
    return next(err)
  }

  var cacheKey = JSON.stringify({'siteinfo': project})
  var cacheValue = cache.get(cacheKey)
  var siteinfo = null
  if (cacheValue === undefined) {
    siteinfo = await_(baseRequest.getAsync('https://' + project + '/w/api.php?action=query&meta=siteinfo&siprop=namespaces|general&format=json'))
    siteinfo = JSON.parse(siteinfo.body)
    cache.set(cacheKey, siteinfo, SITEINFO_TTL)
  } else {
    console.log('siteinfo ' + project + ' cache hit')
    siteinfo = cacheValue
  }

  var excludeNamespaces = []
  for (key in siteinfo.query.namespaces) {
    if (siteinfo.query.namespaces.hasOwnProperty(key) && key !== 0) {
      item = siteinfo.query.namespaces[key]
      excludeNamespaces.push(item['*'] + ':')
      excludeNamespaces.push(item['canonical'] + ':')
    }
  }
  var mainpage = siteinfo.query.general.mainpage.replace(' ', '_')
  console.log('siteinfo ' + project + ' done')

  var promises = []

  for (var i = 1; i < NUMBER_OF_DAYS + 1; i++) {
    var loopTime = endTime - MILLISECONDS_IN_DAY * (NUMBER_OF_DAYS - i)
    var currentDate = new Date(loopTime)
    var year = currentDate.getFullYear()
    var month = pad(currentDate.getMonth() + 1, 2, '0')
    var date = pad(currentDate.getDate(), 2, '0')
    var formattedDate = year + '-' + month + '-' + date
    resultDates.push(formattedDate)
    console.log('start ' + project + ' - ' + formattedDate)
    promises.push(processDay(project, year, month, date))
  }
  var articleByDay = await_(promises)

  articleByDay.forEach(function (articles, i) {
    articles.forEach(function (v) {
      // Filter: ignore non-article pages
      for (var j = 0; j < excludeNamespaces.length; j++) {
        if (v.article.startsWith(excludeNamespaces[j])) {
          return
        }
      }

      // Filter: ignore main page
      if (v.article.startsWith(mainpage)) {
        return
      }

      // for newly trending article
      // pad zeros on left
      if (!(v.article in articleCountByDay)) {
        articleCountByDay[v.article] = []
        for (var k = 0; k < i; k++) {
          articleCountByDay[v.article].push(0)
        }
      }

      articleCountByDay[v.article].push(v.views)
    })

    // now I require all articleCountByDay items to be array of length 'i + 1',
    // if not, pad right with zero
    for (var key in articleCountByDay) {
      if (articleCountByDay.hasOwnProperty(key)) {
        var item = articleCountByDay[key]
        if (item.length < i + 1) {
          var l = i + 1 - item.length
          for (var k = 0; k < l; k++) {
            articleCountByDay[key].push(0)
          }
        }
      }
    }
  })

  // Filtering
  // Arbitary number killing
  for (key in articleCountByDay) {
    if (articleCountByDay.hasOwnProperty(key)) {
      item = articleCountByDay[key]
      if (item.every(function (v) {
        return (v < 500)
      })) {
        delete articleCountByDay[key]
      }
    }
  }

  // Diff every day
  var articleCountDiffs = {}
  for (key in articleCountByDay) {
    if (articleCountByDay.hasOwnProperty(key)) {
      item = articleCountByDay[key]
      articleCountDiffs[key] = []
      for (var index = 0; index < NUMBER_OF_DAYS - 1; index++) {
        articleCountDiffs[key].push(item[index + 1] - item[index])
      }
    }
  }

  // Score = total diff
  var articleScore = {}
  for (key in articleCountDiffs) {
    if (articleCountDiffs.hasOwnProperty(key)) {
      item = articleCountDiffs[key]
      articleScore[key] = item.reduce(function (prevValue, curValue) {
        return prevValue + curValue
      })
    }
  }

  // Sort and take top 50
  // http://stackoverflow.com/questions/1069666/sorting-javascript-object-by-property-value/16794116#16794116
  var articleScoreTopKeys = Object.keys(articleScore).sort(function (a, b) {
    return articleScore[a] - articleScore[b]
  }).slice(-50)

  for (key in articleCountByDay) {
    if (articleCountByDay.hasOwnProperty(key)) {
      if (articleScoreTopKeys.indexOf(key) === -1) {
        delete articleCountByDay[key]
      }
    }
  }

  res.render('result', { data: JSON.stringify(articleCountByDay), dates: JSON.stringify(resultDates) })
}))

app.get('/sit/', function (req, res) {
  res.render('index')
})

app.listen(port, function () {
  console.log('Listening on port ' + port)
})

// Error handling
app.use(function (err, req, res, next) {
  if (err.status) {
    res.status(err.status)
    res.send(err.message)
  } else {
    console.error(err.stack)
    res.status(500)
    res.send('Something broke!')
  }
})
