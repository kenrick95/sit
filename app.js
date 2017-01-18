var express = require('express')
var app = express()
var Promise = require('bluebird')
var request = Promise.promisifyAll(require('request'))
var async = require('asyncawait/async')
var await = require('asyncawait/await')
var pad = require("underscore.string/pad")
var port = parseInt(process.env.PORT, 10)
if (isNaN(port)) {
  port = 80
}

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
const NUMBER_OF_DAYS = 3

app.set('view engine', 'pug')

app.use('/sit/static/chart.js', express.static('node_modules/chart.js/dist'))
app.use('/sit/static', express.static('views/js'))

app.get('/sit/:project/until/:endTime', async(function (req, res) {
  var endTime = (new Date(req.params.endTime)).getTime()
  var articleCountByDay = {}
  var project = req.params.project
  var result = []
  var resultDates = []

  var siteinfo = await(request.getAsync('https://id.wikipedia.org/w/api.php?action=query&meta=siteinfo&siprop=namespaces|general&format=json'))
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

  for(var i = 1; i < NUMBER_OF_DAYS + 1; i++) {
    var loopTime = endTime - MILLISECONDS_IN_DAY * (NUMBER_OF_DAYS - i)
    var currentDate = new Date(loopTime)
    var year = currentDate.getFullYear()
    var month = pad(currentDate.getMonth() + 1, 2, '0')
    var date = pad(currentDate.getDate(), 2, '0')
    var response = await(request.getAsync('https://wikimedia.org/api/rest_v1/metrics/pageviews/top/' + project + '/all-access/'+ year +'/'+ month + '/' + date))
    if (response.statusCode == 200) {
      response = JSON.parse(response.body)
      items = response.items
      var resultDate = items[0].year + "-" + items[0].month + "-" + items[0].day

      console.log(resultDate)
      resultDates.push(resultDate)

      articles = items[0].articles
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
          for (var k = 0; k < i - 1; k++) {
            articleCountByDay[v.article].push(0)
          }
        }

        articleCountByDay[v.article].push(v.views)
      })

      // now I require all articleCountByDay items to be array of length "i",
      // if not, pad right with zero
      for (var key in articleCountByDay) {
        if (articleCountByDay.hasOwnProperty(key)) {
          var item = articleCountByDay[key]
          if (item.length < i) {
            var l = i - item.length
            for (var k = 0; k < l; k++) {
              articleCountByDay[key].push(0)
            }
          }
        }
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
