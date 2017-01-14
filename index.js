var express = require('express')
var app = express()
var Promise = require('bluebird')
var request = Promise.promisifyAll(require('request'))
var async = require('asyncawait/async')
var await = require('asyncawait/await')
var pad = require("underscore.string/pad")

// for a given date period "start" till "end",
//     determine what is a trending topic on Wikipedia

const MILLISECONDS_IN_DAY = 86400000
const NUMBER_OF_DAYS = 3

app.use('/static/chart.js', express.static('node_modules/chart.js/dist'))
app.use('/static', express.static('views/js'))
app.set('view engine', 'pug')

app.get('/:project/until/:endTime', async(function (req, res) {
  var endTime = (new Date(req.params.endTime)).getTime()
  var articleCountByDay = {}
  var project = req.params.project
  var result = []
  var resultDates = []
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
      articles.forEach((v) => {
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
  res.render('index', { data: JSON.stringify(articleCountByDay), dates: JSON.stringify(resultDates) })
}))

app.listen(80, function () {
  console.log('Example app listening on port 80!')
})
