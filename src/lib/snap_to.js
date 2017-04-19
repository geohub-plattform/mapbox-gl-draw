const StringSet = require('../lib/string_set');
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

function toLineStrings(feature) {
  const result = [];
  const flat = turf.flatten(feature);
  turf.geomEach(flat, (geometry) => {
    result.push(turf.lineString(geometry.coordinates));
  });

  return result;
}


// All are required
module.exports = function snapTo(evt, ctx, id) {
  if (ctx.map === null) return [];

  const line = ctx.store.get(id);

  const buffer = 20; // ctx.options.snapBuffer;
  const box = [
    [evt.point.x - buffer, evt.point.y - buffer],
    [evt.point.x + buffer, evt.point.y + buffer]
  ];

  let distanceBox = null;
  if (line && line.coordinates.length > 1) {
    const lastLinePoint = line.coordinates[line.coordinates.length - 2];
    const lastPoint = ctx.map.project(lastLinePoint);

    const extendBox = [
      [lastPoint.x - buffer, lastPoint.y - buffer],
      [lastPoint.x + buffer, lastPoint.y + buffer],
      [evt.point.x - buffer, evt.point.y - buffer],
      [evt.point.x + buffer, evt.point.y + buffer]
    ];

    const bboxPoints = [];
    extendBox.forEach((element) => {
      const point = ctx.map.unproject(element);
      bboxPoints.push(turf.point([point.lng, point.lat]));
    });

    const bbox = turf.bbox(turf.featureCollection(bboxPoints));

    distanceBox = [[bbox[0], bbox[1]], [bbox[2], bbox[1]],
      [bbox[2], bbox[3]], [bbox[0], bbox[3]], [bbox[0], bbox[1]]];
/*    distanceBox = [
      [evt.lngLat.lng, evt.lngLat.lat], [lastLinePoint[0], evt.lngLat.lat],
      [lastLinePoint[0], lastLinePoint[1]], [evt.lngLat.lng, lastLinePoint[1]],
      [evt.lngLat.lng, evt.lngLat.lat]
    ];*/

    const pos1 = ctx.map.project(distanceBox[0]);
    const pos2 = ctx.map.project(distanceBox[2]);
    box[0] = [pos1.x, pos1.y];
    box[1] = [pos2.x, pos2.y];
  }

  console.log("distanceBox: ", distanceBox);
  console.log("box: ", box);

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
  if (distanceBox) {
    selectedElements.features.push(turf.lineString(distanceBox));
    console.log("selected elements: ", selectedElements);
  }

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
        type: "line",
        paint: {
          "line-color": "#0000ff"
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
    /*    const points = toPointArray(feature);
     points.forEach((point) => {
     selectedElements.features.push(point);
     });*/
    const lines = toLineStrings(feature);
    selectedElements.features.push(...lines);
    return uniqueFeatures.push(feature);
  });

  if (evtCoords === undefined || uniqueFeatures.length < 1) {
    //remove point
    ctx.map.getSource("snap-source").setData({
      "type": "FeatureCollection",
      "features": []
    });
    if (DEBUG_SNAP) {
      ctx.map.getSource("snap-elements").setData(selectedElements);
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
