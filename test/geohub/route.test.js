import test from "tape";
import turf from "@turf/turf";
import fs from "fs";

function pointInCoordinates(lineString, pointCoords) {
  const result = [];
  lineString.geometry.coordinates.forEach((coords, index) => {
    if (index !== 0 && index !== lineString.geometry.coordinates.length - 1) {
      if (coords[0] === pointCoords[0] && coords[1] === pointCoords[1]) {
        result.push(index);
      }
    }
  });
  return result;
}

function getRandomColor() {
  var letters = '0123456789ABCDEF';
  var color = '#';
  for (var i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}
function createRandomStroke() {
  return {stroke: getRandomColor()};
}

function createLineAndSaveLength(lineCoords, props) {
  const copyProps = Object.assign({}, props, createRandomStroke());
  const line = turf.lineString(lineCoords, copyProps);
  copyProps.length = turf.lineDistance(line);
  return line;

}

function lineSplit(lineString, pointIndexes) {
  const props = lineString.properties;
  let lineCoords = [...lineString.geometry.coordinates];
  const result = [];
  let delta = 0;
  pointIndexes.forEach((pointIndex) => {
    pointIndex -= delta;
    if (pointIndex < lineCoords.length - 1) {
      const secondPart = lineCoords.splice(pointIndex, lineCoords.length - pointIndex);
      if (lineCoords.length > 0) { // if a part is remaining
        lineCoords.push(secondPart[0]); // duplicate cutting point
        result.push(createLineAndSaveLength(lineCoords, props));
      }
      lineCoords = secondPart;
      delta += pointIndex;
    }
  });
  if (lineCoords.length > 0) {
    result.push(createLineAndSaveLength(lineCoords, props));
  }
  return result;
}

function splitLines(lineString1, lineString2) {
  const line1CutPoints = [];
  const line2CutPoints = [];

  lineString1.geometry.coordinates.forEach((coords, index) => {
    const points = pointInCoordinates(lineString2, coords);
    if (points.length > 0) {
      line2CutPoints.push(...points);
      line1CutPoints.push(index);
    }
  });

  if (line1CutPoints.length === 0 && line2CutPoints.length === 0) {
    return null;
  } else {
    const result = [];
    result.push(...lineSplit(lineString1, line1CutPoints));
    result.push(...lineSplit(lineString2, line2CutPoints));
    return result;
  }
}


test("geohub - find point on lineString coordinates", t => {
  t.plan(3);
  const line1 = turf.lineString([[7.5, 50], [8, 50], [8.5, 50], [9, 50], [9.5, 50]]);
  t.equals(pointInCoordinates(line1, [7.5, 50]).length, 0);
  t.equals(pointInCoordinates(line1, [8.5, 50])[0], 2);
  t.equals(pointInCoordinates(line1, [9.5, 50]).length, 0);
});

test("geohub - split lineString", t => {
  t.plan(2);
  const line1 = turf.lineString([[7.5, 50], [8, 50], [8.5, 50], [9, 50], [9.5, 50]]);
  const lines = lineSplit(line1, [2]);
  t.equals(JSON.stringify(lines[0].geometry.coordinates), "[[7.5,50],[8,50],[8.5,50]]");
  t.equals(JSON.stringify(lines[1].geometry.coordinates), "[[8.5,50],[9,50],[9.5,50]]");
});

test("geohub - split lineString two times", t => {
  t.plan(3);
  const line1 = turf.lineString([[7.5, 50], [8, 50], [8.5, 50], [9, 50], [9.5, 50]]);
  const lines = lineSplit(line1, [1, 3]);
  t.equals(JSON.stringify(lines[0].geometry.coordinates), "[[7.5,50],[8,50]]");
  t.equals(JSON.stringify(lines[1].geometry.coordinates), "[[8,50],[8.5,50],[9,50]]");
  t.equals(JSON.stringify(lines[2].geometry.coordinates), "[[9,50],[9.5,50]]");
});

test("geohub - split lineString at vertex", t => {
  t.plan(4);
  const line1 = turf.lineString([[7.5, 50], [8, 50], [8.5, 50], [9, 50], [9.5, 50]]);
  const linesStart = lineSplit(line1, [0]);
  const linesEnd = lineSplit(line1, [4]);
  t.equals(linesStart.length, 1);
  t.equals(JSON.stringify(line1.geometry), JSON.stringify(linesStart[0].geometry));
  t.equals(linesEnd.length, 1);
  t.equals(JSON.stringify(line1.geometry), JSON.stringify(linesEnd[0].geometry));
});

test("geohub - split two lineStrings", t => {
  const line1 = turf.lineString([[7.5, 50], [8, 50], [8.5, 50], [9, 50], [9.5, 50]]);
  const line2 = turf.lineString([[7.5, 49], [8, 50], [8.5, 49], [9, 50], [9.5, 49]]);
  const result = splitLines(line1, line2);
  t.equals(result.length, 6);
  t.end();
});

test("geohub - convert lineStrings into mesh", {skip: false}, t => {
  const fc = JSON.parse(fs.readFileSync("./test/geohub/testdata.json"));
  //const fc = JSON.parse(fs.readFileSync("./errordata2.json"));
  t.ok(fc);
  const features = fc.features;

  console.time("Searching");
  features.forEach((lineString1) => {
    let line1CutPoints = lineString1.properties.cutPoints;
    if (!line1CutPoints) {
      line1CutPoints = [];
      lineString1.properties.cutPoints = line1CutPoints;
    }
    features.forEach((lineString2) => {
      if (lineString1 !== lineString2) {
        let line2CutPoints = lineString2.properties.cutPoints;
        if (!line2CutPoints) {
          line2CutPoints = [];
          lineString2.properties.cutPoints = line2CutPoints;
        }
        lineString1.geometry.coordinates.forEach((coords, index) => {
          const points = pointInCoordinates(lineString2, coords);
          if (points.length > 0) {
            points.forEach((cutPoint) => {
              if (line2CutPoints.indexOf(cutPoint) === -1) {
                line2CutPoints.push(cutPoint);
              }
            });
            if (index !== 0 && index !== lineString1.geometry.coordinates.length - 1) {
              if (line1CutPoints.indexOf(index) === -1) {
                line1CutPoints.push(index);
              }
            }
          }
        });
      }
    });
  });
  console.timeEnd("Searching");
  console.time("Sorting & Meshing");
  const mesh = [];
  features.forEach((lineString) => {
    lineString.properties.cutPoints.sort((a, b) => {
      return a - b;
    });
    mesh.push(...lineSplit(lineString, lineString.properties.cutPoints));
  });
  console.timeEnd("Sorting & Meshing");
  console.log("Mesh size: ", mesh.length);


  const startpoint = [9.2406725, 49.1373313];
  const endpoint = [9.2401371, 49.136443];


  fs.writeFileSync("mesh.json", JSON.stringify(turf.featureCollection(mesh), null, 1));

  t.end();
});


/*  const allPoints = turf.coordAll(fc);
 const index = kdbush(allPoints);
 var nearest = geokdbush.around(index, 8, 50, 1, 0);
 console.log("nearest: ", nearest);*/


/*  const splitLines = turf.lineSplit(line1, point);

 turf.featureEach(splitLines, (feature) => {
 console.log("line: ", feature.geometry);
 });*/

/*
 const pointAlong = turf.along(line1, 71.49662609671813);
 console.log("point: ", pointAlong);
 const pointOnLine = turf.pointOnLine(line1, pointAlong);

 console.log(pointOnLine);

 t.ok(isNaN(pointOnLine.properties.location));*/

// var features = turf.lineIntersect(line1, line2);
//  var features = turf.lineSegment(line1);

/*  turf.featureEach(features, (feature) => {
 console.log("feature: ", JSON.stringify(feature, null, 1));
 });*/


//const mesh = createMesh([line1, line2, line3]);
//t.assert(mesh.length, 4);
