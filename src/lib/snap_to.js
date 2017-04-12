const StringSet = require('../lib/string_set');
const coordEach = require('@turf/meta').coordEach;
const turf = require('@turf/turf');
const cheapRuler = require('cheap-ruler');

const DEBUG_SNAP = false;

function toPointArray(feature) {
  const result = [];
  turf.coordAll(feature).forEach((coords) => {
    result.push(turf.point(coords));
  });
  return result;
}


// All are required
module.exports = function snapTo(evt, ctx, id) {
  if (ctx.map === null) return [];

  //console.log("---");
  const buffer = 20; // ctx.options.snapBuffer;
  const box = [
    [evt.point.x - buffer, evt.point.y - buffer],
    [evt.point.x + buffer, evt.point.y + buffer]
  ];

  //console.log("Box: ", box);

  //const snapFilter = {layers: ["road-street", "road-service-link-track", "road-path", "road-secondary-tertiary", "road-motorway"]};
  const snapFilter = {layers: ['demodata', 'gl-draw-polygon-stroke-inactive.cold', 'gl-draw-line-inactive.cold', 'gl-draw-point-inactive.cold']};
  //const snapFilter = {filter: ["any", ["has", "geohub"], ["in", "class", "street_major", "street_minor", "street_limited", "service", "link", "track", "street", "path", "secondary", "primary", "tertiary", "motorway"]]};
  const featureIds = new StringSet();
  const uniqueFeatures = [];
  const evtCoords = (evt.lngLat.toArray !== undefined) ? evt.lngLat.toArray() : undefined;
  //console.log("evtCoors: ", evtCoords);

  let closestDistance = null;
  let closestCoord;
  let closestFeature;

  const eventPoint = {
    "type": "Feature",
    "properties": {},
    "geometry": {
      "type": "Point",
      "coordinates": [0, 0]
    }
  };

  const selectedElements = {
    "type": "FeatureCollection",
    "features": []
  };

  if (ctx.map.getSource("snap-source") === undefined) {
    console.log("adding snap-source");
    ctx.map.addSource('snap-source', {
      type: 'geojson',
      data: eventPoint
    });
  }
  if (ctx.map.getLayer("snap-layer") === undefined) {
    console.log("adding snap-layer");
    ctx.map.addLayer({
      id: "snap-layer",
      source: "snap-source",
      type: "circle",
      paint: {
        "circle-color": "#ff0000",
        "circle-radius": 7
      }
    });
  }
  if (DEBUG_SNAP) {
    if (ctx.map.getSource("snap-elements") === undefined) {
      console.log("adding snap-elements");
      ctx.map.addSource('snap-elements', {
        type: 'geojson',
        data: selectedElements
      });
    }
    if (ctx.map.getLayer("snap-elements") === undefined) {
      console.log("adding snap-elements");
      ctx.map.addLayer({
        id: "snap-elements",
        source: "snap-elements",
        type: "circle",
        paint: {
          "circle-color": "#0000ff",
          "circle-radius": 4
        }
      });
    }
  }

  const renderedFeatures = ctx.map.queryRenderedFeatures(box, snapFilter);
  //console.log("renderedFeatures: ", renderedFeatures);
  renderedFeatures.forEach((feature) => {
    const featureId = feature.properties.id;
    //console.log("checking featureId: ", featureId, " currentId: ", id);

    if (featureId !== undefined) {
      if (featureIds.has(featureId) || String(featureId) === id) {
        return;
      }
      featureIds.add(featureId);
    }
    const points = toPointArray(feature);
    points.forEach((point) => {
      selectedElements.features.push(point);
    });
    return uniqueFeatures.push(feature);
  });

  if (evtCoords === undefined || uniqueFeatures.length < 1) {
    //remove point
    ctx.map.getSource("snap-source").setData({
      "type": "FeatureCollection",
      "features": []
    });
    if (DEBUG_SNAP) {
      ctx.map.getSource("snap-elements").setData({
        "type": "FeatureCollection",
        "features": []
      });
    }
    return evt;
  } else {
    if (DEBUG_SNAP) {
      ctx.map.getSource("snap-elements").setData(selectedElements);
    }
  }

  const closestPoints = function (ruler, coordinates, evtCoords) {
    const result = [];
    const pointIndex = ruler.pointOnLine(coordinates, evtCoords);
    result.push({type: "linepoint", coords: pointIndex.point});
    let vertex = null;
    if (pointIndex.index === coordinates.length) {
      vertex = coordinates[pointIndex.index];
    } else {
      const p1 = coordinates[pointIndex.index];
      const p2 = coordinates[pointIndex.index + 1];
      const distance1 = ruler.distance(p1, evtCoords);
      const distance2 = ruler.distance(p2, evtCoords);
      vertex = distance1 < distance2 ? p1 : p2;
    }
    result.push({type: "vertex", coords: vertex});
    return result;
  };

  //console.log("Unique features: ", uniqueFeatures);
  //snapto line
  uniqueFeatures.forEach((feature) => {
    const type = feature.geometry.type;
    const coords = [];
    const ruler = cheapRuler.fromTile(feature._vectorTileFeature._y, feature._vectorTileFeature._z); //z is max map zoom of 20

    if (type === "LineString") {
      closestPoints(ruler, feature.geometry.coordinates, evtCoords).forEach((pointType) => {
        coords.push(pointType);
      });
    } else if (type === "Point") {
      coords.push({type: "vertex", coords: feature.geometry.coordinates});
    } else if (type === "MultiLineString" || type === "Polygon") {
      feature.geometry.coordinates.forEach((coordinates) => {
        closestPoints(ruler, coordinates, evtCoords).forEach((pointType) => {
          coords.push(pointType);
        });
      });
    }

    if (coords.length === 0) {
      console.log("coords empty for feature: ", feature);
    } else {
      coords.forEach((pointType) => {
        const singleCoords = pointType.coords;
        const dist = ruler.distance(singleCoords, evtCoords);
        //console.log("type: ", pointType.type, " dist: ", dist);
        if (dist !== null) {
          if (closestDistance === null || ((pointType.type === "vertex" && dist < 0.004) ||
            (dist < closestDistance))) {
            feature.distance = dist;
            closestFeature = feature;
            closestCoord = singleCoords;
            closestDistance = dist;
            //console.log("clostest type: ", pointType.type, " dist: ", dist);
          }
        }
      });
    }
  });

  if (closestDistance !== null) {
    evt.lngLat.lng = closestCoord[0];
    evt.lngLat.lat = closestCoord[1];
    evt.point = ctx.map.project(closestCoord);
    evt.snap = true;
    eventPoint.geometry.coordinates = closestCoord;
    ctx.map.getSource("snap-source").setData(eventPoint);
  }
  return evt;
};
