document.querySelector('#submit').addEventListener('click', function () {
  var project = document.querySelector('#project').value
  var endDate = document.querySelector('#endDate').value
  window.location.href = window.location.href + project + '/' + 'until' + '/' + endDate
})
