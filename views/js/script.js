var config = {
  type: 'line',
  data: {
    labels: dates,
    datasets: []
  },
  options: {
    responsive: true,
    title: {
      display: true,
      text: 'Something is trending ...'
    },
    legend: {
      display: false
    },
    hover: {
      mode: 'dataset'
    },
    scales: {
      xAxes: [{
        display: true,
        scaleLabel: {
          display: true,
          labelString: 'Date'
        }
      }],
      yAxes: [{
        display: true,
        scaleLabel: {
          display: true,
          labelString: 'Page views'
        },
        ticks: {
          suggestedMin: -10,
          suggestedMax: 250
        }
      }]
    }
  }
}
var item = null
var formattedItem = null
for (var key in data) {
  if (data.hasOwnProperty(key)) {
    item = data[key]
    formattedItem = {
      label: key,
      data: item
    }
    config.data.datasets.push(formattedItem)
  }
}

var ctx = document.getElementById('chart').getContext('2d')
window.lineChart = new Chart(ctx, config)
