const xtend = require('xtend');
const Constants = require('./constants');

const defaultOptions = {
  defaultMode: Constants.modes.SIMPLE_SELECT,
  keybindings: true,
  clickBuffer: 2,
  snapBuffer: 15,
  boxSelect: true,
  snapTo: true,
  displayControlsDefault: true,
  styles: require('./lib/theme'),
  controls: {},
  userProperties: false,
  snapStyles: ['gl-draw-polygon-stroke-inactive.cold', 'gl-draw-line-inactive.cold', 'gl-draw-point-inactive.cold'],
  snapOverCircleStyle: {
    'id': 'gl-draw-circle-snap',
    'type': 'circle',
    'paint': {
      'circle-radius': 3,
      'circle-color': '#FF0',
      'circle-stroke-width' : 1,
      'circle-stroke-color' :'#000'
    },
    'filter': ['all', ["==", "id", ""]],
    'source': 'mapbox-gl-draw-cold'
  },
  snapOverLineStyle: {
    'id': 'gl-draw-line-snap',
    'type': 'line',
    'layout': {
      'line-cap': 'round',
      'line-join': 'round'
    },
    'paint': {
      'line-color': '#00F',
      'line-width': 1
    },
    'filter': ['all', ["==", "id", ""]],
    'source': 'mapbox-gl-draw-cold'
  }
};

const showControls = {
  point: true,
  line_string: true,
  polygon: true,
  trash: true,
  combine_features: true,
  uncombine_features: true
};

const hideControls = {
  point: false,
  line_string: false,
  polygon: false,
  trash: false,
  combine_features: false,
  uncombine_features: false
};

function addSources(styles, sourceBucket) {
  return styles.map(style => {
    if (style.source) return style;
    return xtend(style, {
      id: `${style.id}.${sourceBucket}`,
      source: (sourceBucket === 'hot') ? Constants.sources.HOT : Constants.sources.COLD
    });
  });
}

module.exports = function(options = {}) {
  let withDefaults = xtend(options);

  if (!options.controls) {
    withDefaults.controls = {};
  }

  if (options.displayControlsDefault === false) {
    withDefaults.controls = xtend(hideControls, options.controls);
  } else {
    withDefaults.controls = xtend(showControls, options.controls);
  }

  withDefaults = xtend(defaultOptions, withDefaults);

  // Layers with a shared source should be adjacent for performance reasons
  withDefaults.styles = addSources(withDefaults.styles, 'cold').concat(addSources(withDefaults.styles, 'hot'));

  return withDefaults;
};
