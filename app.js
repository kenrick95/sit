var express = require('express')
var app = express()
var Promise = require('bluebird')
var request = require('request')
var async = require('asyncawait/async')
var await = require('asyncawait/await')
var pad = require("underscore.string/pad")
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
    String.prototype.startsWith = function(searchString, position){
      position = position || 0;
      return this.substr(position, searchString.length) === searchString;
  };
}

// for a given date period "start" till "end",
//     determine what is a trending topic on Wikipedia

const MILLISECONDS_IN_DAY = 86400000
const NUMBER_OF_DAYS = 14

app.set('view engine', 'pug')

app.use('/sit/static/chart.js', express.static('node_modules/chart.js/dist'))
app.use('/sit/static/randomcolor', express.static('node_modules/randomcolor'))
app.use('/sit/static', express.static('views/js'))

var processDay = async(function (project, year, month, date) {
  var response = await(baseRequest.getAsync('https://wikimedia.org/api/rest_v1/metrics/pageviews/top/' + project + '/all-access/'+ year +'/'+ month + '/' + date))
  if (response.statusCode == 200) {
    response = JSON.parse(response.body)
    items = response.items
    var resultDate = items[0].year + "-" + items[0].month + "-" + items[0].day
    console.log(resultDate + " done")

    return items[0].articles
  }
  return []
})

app.get('/sit/:project/until/:endTime', async(function (req, res) {
  var endTime = (new Date(req.params.endTime)).getTime()
  var articleCountByDay = {}
  var project = req.params.project
  var result = []
  var resultDates = []

  var siteinfo = await(baseRequest.getAsync('https://id.wikipedia.org/w/api.php?action=query&meta=siteinfo&siprop=namespaces|general&format=json'))
  siteinfo = JSON.parse(siteinfo.body)
  var excludeNamespaces = []
  for (var key in siteinfo.query.namespaces) {
    if (siteinfo.query.namespaces.hasOwnProperty(key) && key != 0) {
      var item = siteinfo.query.namespaces[key]
      excludeNamespaces.push(item['*'] + ':')
      excludeNamespaces.push(item['canonical'] + ':')
    }
  }
  var mainpage = siteinfo.query.general.mainpage.replace(' ', '_')
  console.log("siteinfo done")

  var promises = []

  for(var i = 1; i < NUMBER_OF_DAYS + 1; i++) {
    var loopTime = endTime - MILLISECONDS_IN_DAY * (NUMBER_OF_DAYS - i)
    var currentDate = new Date(loopTime)
    var year = currentDate.getFullYear()
    var month = pad(currentDate.getMonth() + 1, 2, '0')
    var date = pad(currentDate.getDate(), 2, '0')
    var formattedDate = year + "-" + month + "-" + date
    resultDates.push(formattedDate)
    console.log("start " + formattedDate)
    promises.push(processDay(project, year, month, date))
  }
  var articleByDay = await(promises)

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

    // now I require all articleCountByDay items to be array of length "i + 1",
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
  for (var key in articleCountByDay) {
    if (articleCountByDay.hasOwnProperty(key)) {
      var item = articleCountByDay[key]
      if (item.every(function(v) {
        return (v < 500)
      })) {
        delete articleCountByDay[key];
      }
    }
  }

  // Diff every day
  var articleCountDiffs = {}
  for (var key in articleCountByDay) {
    if (articleCountByDay.hasOwnProperty(key)) {
      var item = articleCountByDay[key]
      articleCountDiffs[key] = []
      for (var i = 0; i < NUMBER_OF_DAYS - 1; i++) {
        articleCountDiffs[key].push(item[i + 1] - item[i])
      }
    }
  }

  // Score = total diff
  var articleScore = {}
  for (var key in articleCountDiffs) {
    if (articleCountDiffs.hasOwnProperty(key)) {
      var item = articleCountDiffs[key]
      articleScore[key] = item.reduce(function (prevValue, curValue) {
        return prevValue + curValue
      })
    }
  }

  // Sort and take top 50
  // http://stackoverflow.com/questions/1069666/sorting-javascript-object-by-property-value/16794116#16794116
  var articleScoreTopKeys = Object.keys(articleScore).sort(function(a,b){return articleScore[a]-articleScore[b]}).slice(-50)
  
  for (var key in articleCountByDay) {
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
  console.log('Example app listening on port ' + port)
})
