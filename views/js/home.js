/* globals $, validProjects */

$(function () {
  $('#submit').click(function () {
    var project = $('#project').val()
    var endDate = $('#endDate').val()
    if (window.location.href.lastIndexOf('/') < window.location.href.length - 1) {
      project = '/' + project
    }
    window.location.href = window.location.href + project + '/' + 'until' + '/' + endDate
  })
  $('#endDate').datepicker({
    dateFormat: 'yy-mm-dd',
    maxDate: '-1d',
    minDate: new Date('2015-07-01T00:00:00.000Z')
  })
  $('#project').autocomplete({
    source: validProjects
  })
})
