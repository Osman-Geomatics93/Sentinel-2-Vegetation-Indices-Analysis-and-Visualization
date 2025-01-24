
var startDate = '2019-11-20';
var endDate = '2020-04-25';

// Cloud masking function
function maskS2clouds(image) {
  var qa = image.select('QA60');
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0).and(
             qa.bitwiseAnd(cirrusBitMask).eq(0));
  return image.updateMask(mask).divide(10000);
}

// Calculate indices
function addIndicesS2(image) {
  return image.addBands([
    image.normalizedDifference(['B8', 'B4']).rename('NDVI'),
    image.normalizedDifference(['B8', 'B5']).rename('NDRE'),
    image.expression('2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {
      'NIR': image.select('B8'),
      'RED': image.select('B4'),
      'BLUE': image.select('B2')
    }).rename('EVI'),
    image.expression('(NIR - RED) * (1 + L) / (NIR + RED + L)', {
      'NIR': image.select('B8'),
      'RED': image.select('B4'),
      'L': 0.5
    }).rename('SAVI'),
    image.normalizedDifference(['B3', 'B8']).rename('NDWI'),
    image.expression('(2 * NIR + 1 - sqrt(pow((2 * NIR + 1), 2) - 8 * (NIR - RED))) / 2', {
      'NIR': image.select('B8'),
      'RED': image.select('B4')
    }).rename('MSAVI'),
    image.normalizedDifference(['B8', 'B3']).rename('GNDVI'),
    image.expression('(NIR - (RED - (RED - BLUE))) / (NIR + (RED - (RED - BLUE)))', {
      'NIR': image.select('B8'),
      'RED': image.select('B4'),
      'BLUE': image.select('B2')
    }).rename('ARVI'),
    image.expression('(NIR - BLUE) / (NIR - RED)', {
      'NIR': image.select('B8'),
      'RED': image.select('B4'),
      'BLUE': image.select('B2')
    }).rename('SIPI'),
    image.expression('NIR / RED', {
      'NIR': image.select('B8'),
      'RED': image.select('B4')
    }).rename('RVI'),
    image.expression('((NIR - REDEDGE) / (NIR + REDEDGE)) / ((NIR - RED) / (NIR + RED))', {
      'NIR': image.select('B8'),
      'REDEDGE': image.select('B5'),
      'RED': image.select('B4')
    }).rename('CCCI'),
    image.expression('(GREEN - RED) / (GREEN + RED - BLUE)', {
      'GREEN': image.select('B3'),
      'RED': image.select('B4'),
      'BLUE': image.select('B2')
    }).rename('VARI'),
    image.expression('NIR * RED / pow(GREEN, 2)', {
      'NIR': image.select('B8'),
      'RED': image.select('B4'),
      'GREEN': image.select('B3')
    }).rename('CVI')
  ]);
}

/// Process Images
var collection = ee.ImageCollection('COPERNICUS/S2_SR')
  .filterBounds(gezira)
  .filterDate(startDate, endDate)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
  .map(function(image) {
    var processed = maskS2clouds(image);
    var withIndices = addIndicesS2(processed);
    return ee.Image(withIndices).clip(gezira)
      .copyProperties(image, ['system:time_start']);
  });

var composite = collection.median().clip(gezira);

// Calculate statistics for Spider Chart
var indices = ['NDVI', 'NDRE', 'EVI', 'SAVI', 'NDWI', 'MSAVI', 
               'GNDVI', 'ARVI', 'SIPI', 'RVI', 'CCCI', 'VARI', 'CVI'];

var stats = composite.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: gezira,
  scale: 30,
  maxPixels: 1e9
});

// Create Spider Chart data
var spiderData = ee.FeatureCollection(
  indices.map(function(index) {
    return ee.Feature(null, {
      'index': index,
      'value': stats.get(index)
    });
  })
);

// Create Spider Chart with improved styling
var spiderChart = ui.Chart.feature.byFeature(spiderData, 'index', 'value')
  .setChartType('ScatterChart')
  .setOptions({
    title: 'Vegetation Indices Spider Chart',
    titleTextStyle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: '#1a73e8'
    },
    width: 700,
    height: 700,
    lineWidth: 3,
    pointSize: 5,
    series: {
      0: {
        color: '#1a73e8',
        pointShape: 'circle',
        fillOpacity: 0.2,
        areaOpacity: 0.2,
        visibleInLegend: false,
        curveType: 'function'
      }
    },
    hAxis: {
      title: 'Index',
      titleTextStyle: {fontSize: 14, bold: true},
      textStyle: {fontSize: 12}
    },
    vAxis: {
      title: 'Value',
      titleTextStyle: {fontSize: 14, bold: true},
      textStyle: {fontSize: 12},
      gridlines: {
        color: '#e0e0e0',
        count: 8
      }
    },
    chartArea: {
      width: '85%',
      height: '85%'
    },
    backgroundColor: {
      fill: '#ffffff',
      stroke: '#e0e0e0',
      strokeWidth: 1
    },
    polar: true,
    legend: {position: 'none'}
  });

print(spiderChart);

// Create time series charts
var colors = {
  'NDVI': '#45c945', 'NDRE': '#1e88e5', 'EVI': '#43a047',
  'SAVI': '#fdd835', 'NDWI': '#29b6f6', 'MSAVI': '#66bb6a',
  'GNDVI': '#7cb342', 'ARVI': '#9ccc65', 'SIPI': '#ffa726',
  'RVI': '#fb8c00', 'CCCI': '#f4511e', 'VARI': '#6d4c41',
  'CVI': '#8d6e63'
};

indices.forEach(function(index) {
  var timeChart = ui.Chart.image.series({
    imageCollection: collection.select(index),
    region: gezira,
    reducer: ee.Reducer.mean(),
    scale: 30
  }).setOptions({
    title: index + ' Time Series',
    lineWidth: 2,
    pointSize: 4,
    series: {0: {color: colors[index]}},
    vAxis: {title: 'Value'},
    hAxis: {title: 'Date', format: 'MM-yyyy'}
  });
  print(timeChart);
});

// Visualization parameters
var visParams = {
  'NDVI': {min: 0, max: 1, palette: ['red', 'yellow', 'green']},
  'NDRE': {min: 0, max: 0.5, palette: ['brown', 'yellow', 'green']},
  'EVI': {min: 0, max: 1, palette: ['blue', 'green', 'red']},
  'SAVI': {min: -1, max: 1, palette: ['red', 'yellow', 'green']},
  'NDWI': {min: -1, max: 1, palette: ['red', 'white', 'blue']},
  'MSAVI': {min: -1, max: 1, palette: ['red', 'yellow', 'green']},
  'GNDVI': {min: 0, max: 1, palette: ['white', 'green', 'darkgreen']},
  'ARVI': {min: -1, max: 1, palette: ['blue', 'white', 'red']},
  'SIPI': {min: 0, max: 2, palette: ['blue', 'green', 'red']},
  'RVI': {min: 0, max: 10, palette: ['brown', 'orange', 'green']},
  'CCCI': {min: 0, max: 1, palette: ['red', 'yellow', 'green']},
  'VARI': {min: -1, max: 1, palette: ['blue', 'white', 'green']},
  'CVI': {min: 0, max: 5, palette: ['blue', 'cyan', 'green', 'yellow', 'red']}
};

// Add layers to map
Map.centerObject(gezira, 10);
indices.forEach(function(index) {
  Map.addLayer(composite.select(index).clip(gezira), 
    visParams[index], 
    index, 
    false);
});

// Export indices
indices.forEach(function(index) {
  Export.image.toDrive({
    image: composite.select(index),
    description: 'Gezira_' + index,
    scale: 10,
    region: gezira,
    maxPixels: 1e13
  });
});