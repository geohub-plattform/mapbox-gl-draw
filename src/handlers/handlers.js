'use strict';

var util = require('../util');
var Store = require('../store');
var hat = require('hat');

module.exports = {

  initialize(map, options) {
    this._map = map;
    this._currentFeature = false;
    this._container = map.getContainer();
    this._editStore = new Store([]);
    util.setOptions(this, options);
    this._drawStore = this.options.geoJSON;
    this._onKeyUp = this._onKeyUp.bind(this);
    this.enable();
  },

  enable() {
    var map = this._map;
    if (map) {
      util.DOM.disableSelection();
      this._container.addEventListener('keyup', this._onKeyUp);
      this._container.classList.add('mapboxgl-draw-activated');
      map.fire('draw.start', { featureType: this.type });
      this.drawStart();
    }
  },

  disable() {
    util.DOM.enableSelection();
    this._container.removeEventListener('keyup', this._onKeyUp);
    this._container.classList.remove('mapboxgl-draw-activated');
    this._map.fire('draw.stop', { featureType: this.type });
    this.drawStop(this._map);
  },

  featureComplete() {
    this._currentFeature = false;
  },

  editCreate(type, coords) {
    var id = hat();

    // Keeps track of temporary linestring guideline that's
    // drawn after the second point is selected.
    if (type === 'LineString') this._editLineGuide = id;
    this._editStore.set(type, id, coords);
    this._map.fire('edit.feature.update', {geojson: this._editStore.getAll()});
  },

  editUnsetGuide() {
    if (this._editLineGuide) this._editStore.unset('LineString', this._editLineGuide);
    this._editLineGuide = false;
  },

  editDestroy() {
    this._editStore.clear();
    this._map.fire('edit.feature.update', {geojson: this._editStore.getAll()});
  },

  drawCreate(type, coords) {
    if (!this._currentFeature) this._currentFeature = hat();
    var feature = this._drawStore.set(type, this._currentFeature, coords);

    this._map.fire('draw.feature.update', {
      geojson: this._drawStore.getAll()
    });

    this._map.fire('draw.created', {
      featureType: this.type,
      feature: feature
    });
  },

  _translate(id, prev, pos) {
    var feature = this._drawStore.getById(id);
    var dx = pos.x - prev.x;
    var dy = pos.y - prev.y;
    var coords;

    if (feature.geometry.type === 'Polygon')
      coords = feature.geometry.coordinates[0].map(point => {
        var c = this._map.project(point);
        c = this._map.unproject([c.x + dx, c.y + dy]);
        return [c.lng, c.lat];
      });
    else if (feature.geometry.type === 'MultiLineString')
      coords = feature.geometry.coordinates.map(line =>
        line.map(point => {
          var c = this._map.project(point);
          c = this._map.unproject([c.x + dx, c.y + dy]);
          return [c.lng, c.lat];
        })
      );
    else
      coords = feature.geometry.coordinates.map(point => {
        var c = this._map.project(point);
        c = this._map.unproject([c.x + dx, c.y + dy]);
        return [c.lng, c.lat];
      });

    feature = {
      type: 'Feature',
      properties: {
        _drawid: id
      },
      geometry: {
        type: feature.geometry.type,
        coordinates: feature.geometry.type === 'Polygon' ? [coords] : coords
      }
    };
    this._drawStore.update(id, feature);
    this._map.fire('draw.feature.update', {
      geojson: this._drawStore.getAll()
    });
  },

  _onKeyUp(e) {
    switch (e.keyCode) {
      case 27: // ESC
      this.disable();
      break;
    }
  }
};
