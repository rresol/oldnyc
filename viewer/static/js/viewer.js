var markers = [];
var marker_icons = [];
var lat_lon_to_marker = {};
var selected_marker_icons = [];
var selected_marker;
var map;
var start_date = 1850;
var end_date = 2000;

function isOldNycImage(photo_id) {
  // NYC images have IDs like '123f' or '345f-b'.
  return /f(-[a-z])?$/.test(photo_id);
}

function thumbnailImageUrl(photo_id) {
  return 'http://oldnyc.s3.amazonaws.com/thumb/' + photo_id + '.jpg';
}

function expandedImageUrl(photo_id) {
  return 'http://oldnyc.s3.amazonaws.com/600px/' + photo_id + '.jpg';
}

// The callback gets fired when the info for all lat/lons at this location
// become available (i.e. after the /info RPC returns).
function displayInfoForLatLon(lat_lon, marker, opt_callback) {
  var photo_ids = lat_lons[lat_lon];

  var zIndex = 0;
  if (selected_marker) {
    zIndex = selected_marker.getZIndex();
    selected_marker.setIcon(selected_icon);
  }

  if (marker) {
    selected_marker = marker;
    selected_icon = marker.getIcon();
    marker.setIcon(selected_marker_icons[photo_ids.length > 100 ? 100 : photo_ids.length]);
    marker.setZIndex(100000 + zIndex);
  }

  loadInfoForPhotoIds(photo_ids, opt_callback).done(function() {
    var selectedId = null;
    if (photo_ids.length <= 10) {
      selectedId = photo_ids[0];
    }
    showExpanded(lat_lon, photo_ids, selectedId);
  }).fail(function() {
  });
}

function handleClick(e) {
  var lat_lon = e.latLng.lat().toFixed(6) + ',' + e.latLng.lng().toFixed(6)
  var marker = lat_lon_to_marker[lat_lon];
  displayInfoForLatLon(lat_lon, marker);
}

function initialize_map() {
  var latlng = new google.maps.LatLng(40.74421, -73.97370);
  var opts = {
    zoom: 15,
    maxZoom: 18,
    minZoom: 10,
    center: latlng,
    mapTypeId: google.maps.MapTypeId.ROADMAP,
    mapTypeControl: false,
    streetViewControl: true,
    panControl: false,
    zoomControlOptions: {
      position: google.maps.ControlPosition.LEFT_TOP
    },
    styles: [
        {
          featureType: "administrative.land_parcel",
          stylers: [
            { visibility: "off" }
          ]
        },{
          featureType: "landscape.man_made",
          stylers: [
            { visibility: "off" }
          ]
        },{
          featureType: "transit",
          stylers: [
            { visibility: "off" }
          ]
        },{
          featureType: "road.highway",
          elementType: "labels",
          stylers: [
            { visibility: "off" }
          ]
        },{
          featureType: "poi.business",
          stylers: [
            { visibility: "off" }
          ]
        }
      ]
  };
  
  map = new google.maps.Map($('#map').get(0), opts);

  // This shoves the navigation bits down by a CSS-specified amount
  // (see the .spacer rule). This is surprisingly hard to do.
  var map_spacer = $('<div/>').append($('<div/>').addClass('spacer')).get(0);
  map_spacer.index = -1;
  map.controls[google.maps.ControlPosition.TOP_LEFT].push(map_spacer);

  // The OldSF UI just gets in the way of Street View.
  // Even worse, it blocks the "exit" button!
  var streetView = map.getStreetView();
  google.maps.event.addListener(streetView, 'visible_changed',
      function() {
        $('.streetview-hide').toggle(!streetView.getVisible());
      });

  // Create marker icons for each number.
  marker_icons.push(null);  // it's easier to be 1-based.
  selected_marker_icons.push(null);
  for (var i = 0; i < 100; i++) {
    var num = i + 1;
    var size = (num == 1 ? 9 : 13);
    var selectedSize = (num == 1 ? 9 : (num < 10 ? 13 : (num < 100 ? 25 : 39)));
    marker_icons.push(new google.maps.MarkerImage(
      'sprite-2014-08-29.png',
      new google.maps.Size(size, size),
      new google.maps.Point((i%10)*39, Math.floor(i/10)*39),
      new google.maps.Point((size - 1) / 2, (size - 1)/2)
    ));
    selected_marker_icons.push(new google.maps.MarkerImage(
      'selected-2013-01-14.png',
      new google.maps.Size(selectedSize, selectedSize),
      new google.maps.Point((i%10)*39, Math.floor(i/10)*39),
      new google.maps.Point((selectedSize - 1) / 2, (selectedSize - 1)/2)
    ));
  }

  for (var lat_lon in lat_lons) {
    var recs = lat_lons[lat_lon];
    var ll = lat_lon.split(",");
    marker = new google.maps.Marker({
      position: new google.maps.LatLng(parseFloat(ll[0]), parseFloat(ll[1])),
      map: map,
      flat: true,
      visible: true,
      icon: marker_icons[recs.length > 100 ? 100 : recs.length],
      title: lat_lon
    });
    markers.push(marker);
    lat_lon_to_marker[lat_lon] = marker;
    google.maps.event.addListener(marker, 'click', handleClick);
  }

  setUIFromUrlHash();
}


// NOTE: This can only be called when the info for all photo_ids at the current
// position have been loaded (in particular the image widths).
// key is used to construct URL fragments.
function showExpanded(key, photo_ids, opt_selected_id) {
  map.set('keyboardShortcuts', false);
  $('#expanded').show().data('grid-key', key);
  var images = $.map(photo_ids, function(photo_id, idx) {
    var info = infoForPhotoId(photo_id);
    return $.extend({
      id: photo_id,
      largesrc: expandedImageUrl(photo_id),
      src: thumbnailImageUrl(photo_id),
      width: 600,   // these are fallbacks
      height: 400
    }, info);
  });
  $('#grid-container').expandableGrid({
    rowHeight: 200
  }, images);
  if (opt_selected_id) {
    $('#grid-container').expandableGrid('select', opt_selected_id);
  }

  stateWasChanged();
}

function hideExpanded() {
  $('#expanded').hide();
  $(document).unbind('keyup');
  map.set('keyboardShortcuts', true);
  stateWasChanged();
}

// This fills out details for either a thumbnail or the expanded image pane.
function fillPhotoPane(photo_id, $pane) {
  // This could be either a thumbnail on the right-hand side or an expanded
  // image, front and center.
  $('.description', $pane).html(descriptionForPhotoId(photo_id));

  var info = infoForPhotoId(photo_id);
  $('.library-link', $pane).attr('href', libraryUrlForPhotoId(photo_id));

  if (photo_id.match('[0-9]f')) {
    $pane.find('.more-on-back > a').attr(
        'href', backOfCardUrlForPhotoId(photo_id));
        // libraryUrlForPhotoId(photo_id.replace('f', 'b')));
    $pane.find('.more-on-back').show();
  } else {
    $pane.find('.more-on-back').hide();
  }

  var $comments = $pane.find('.comments');
  var width = $comments.parent().width();
  $comments.empty().append(
      $('<fb:comments numPosts="5" colorscheme="light"/>')
          .attr('width', width)
          .attr('href', getCanonicalUrlForPhoto(photo_id)))
  FB.XFBML.parse($comments.get(0));
}

function photoIdFromATag(a) {
  return $(a).attr('href').replace('/#', '');
}

function getPopularPhotoIds() {
  return $('.popular-photo a').map(function(_, a) {
    return photoIdFromATag(a);
  }).toArray();
}

$(function() {
  // Clicks on the background or "exit" button should leave the slideshow.
  // Clicks on the strip itself should only exit if they're not on an image.
  $('#curtains, #exit-slideshow').click(hideExpanded);

  $('#grid-container').on('og-select', 'li', function(e, div) {
    var id = $(this).data('image-id');
    $(div).empty().append(
        $('#image-details-template').clone().removeAttr('id').show());
    fillPhotoPane(id, $(div));
    stateWasChanged(id);
  })
  .on('og-deselect', function() {
    stateWasChanged(null);
  })
  .on('click', '.og-fullimg', function() {
    var photo_id = $('#grid-container').expandableGrid('selectedId');
    window.open(libraryUrlForPhotoId(photo_id), '_blank');
  });

  $('#grid-container').on('click', '.rotate-image-button', function() {
    var $img = $(this).closest('li').find('.og-fullimg img');
    var currentRotation = $img.data('rotate') || 0;
    currentRotation += 90;
    $img
      .css('transform', 'rotate(' + currentRotation + 'deg)')
      .data('rotate', currentRotation);
  });

  $('.popular-photo').on('click', 'a', function(e) {
    e.preventDefault();
    var selectedPhotoId = photoIdFromATag(this);
    var photoIds = getPopularPhotoIds();

    loadInfoForPhotoIds(photoIds).done(function() {
      showExpanded('pop', photoIds, selectedPhotoId);
    }).fail(function() {
    });
  });
});