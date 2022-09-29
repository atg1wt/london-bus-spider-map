/**
 * London Bus Spider Map
 * @version 2022.09.26.01
 * @author Tyrone C.
 * @copyright © 2022 by the author
 * @license MIT
 */

 'use strict';

class SpiderMap {

	// How long the corner popup messages are shown for
	statusMessageTimeout = 2000;
	// How long to wait for location service
	locateTimeout = 60000;
	// Name of cookie to store map coordinates and zoom level
	cookieName = 'spiderBusMapViewCoords'
	// Client object for accessing server API
	api;
	// Leaflet map object
	map;
	// Circle to mark user location on map
	locationCircle;
	// Popup message for fetching location
	locationMessage;
	// Bus stops within current display area
	stops = [];
	// Bus stops markers currently displayed, indexed by LBSL code
	stopMarkers = {};
	// Bus routes shown on spider map, indexed by route,run
	routes = {};
	// Map layer for route graphics
	routeLayer;
	// list of colors to use for drawing routes
	colors = ['red', 'hotpink', 'orange', 'green', 'cornflowerblue', 'darkblue', 'mediumvioletred', 'black', 'magenta', 'indianred', 'limegreen', 'aquamarine', 'yellow', 'cyan'];
	// these colors need a CSS shadow so they can be read on white backgrounds
	lightColors = ['aquamarine', 'yellow', 'cyan'];
	
	constructor(options) {
		// Get options
		this.statusMessageManager = options.statusMessageManager || null;
		// Set up API
		this.api = new RestClient({
			endpoint: 'SpiderMapAPI.php?',
			statusMessageManager: this.statusMessageManager
		});
		// Create prototype object for geolocation button
		let Locate = L.Control.extend({
			options: {
				position: 'topright'
			},
			onAdd: function(map) {
				const foo = L.DomUtil.create('div', 'locate');
				foo.id = 'locate';
				foo.innerHTML = '<span>?</span>';
				foo.addEventListener('click', this.requestUserLocation.bind(this));
				return foo;
			}.bind(this)
		});
		// Create map
		const saved = this.loadMapState();
		this.map = L.map('map', {
			zoomSnap: 0.1,
			maxZoom: 19,
			minZoom: 9,
			center: saved.center,
			zoom: saved.zoom,
		});
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			maxNativeZoom: 19,
			attribution: '<a href="https://www.openstreetmap.org/copyright">OSM</a> | <a href="https://tfl.gov.uk/info-for/open-data-users/api-documentation">TfL</a>',
		}).addTo(this.map);
		this.routeLayer = L.layerGroup().addTo(this.map);
		L.control.scale().addTo(this.map);
		this.map.addControl(new Locate());
		this.map.on('moveend', this.mapMoved.bind(this));
		this.map.on('locationfound', this.locationFound.bind(this));
		this.map.on('locationerror', this.locationError.bind(this));
		this.mapMoved();
		fixViewportSize();
	}

	requestUserLocation() {
		if (this.statusMessageManager) {
			this.statusMessageManager.remove(this.locationMessage);
		}
		this.map.stopLocate();
		if (this.statusMessageManager) {
			this.locationMessage = this.statusMessageManager.add("Getting user's location...");
		}
		if (this.locationCircle) { this.map.removeLayer(this.locationCircle); }
		this.map.locate({
			setView: true,
			timeout: this.locateTimeout
		});
		this.saveMapState();
	}

	locationFound(evt) {
		let loc = evt.latlng;
		let rad = evt.accuracy / 2;
		if (this.locationCircle) { this.map.removeLayer(this.locationCircle); }
		this.locationCircle = L.circle(loc, rad, {
			stroke: false,
			fill: true,
			fillColor: '#000',
			fillOpacity: 0.2
		}).addTo(this.map);
		if (this.statusMessageManager) {
			this.statusMessageManager.remove(this.locationMessage);
		}
	}
	
	locationError() {
		this.statusMessageManager.modify(this.locationMessage, 'Failed to get user location', this.statusMessageTimeout);
	}

	async mapMoved() {
		const b = this.map.getBounds();
		const coords = `${b.getWest()},${b.getSouth()}/${b.getEast()},${b.getNorth()}`;
		if (this.map.getZoom() > 15) {
			const response = await this.api.request({
				resource: `/stops/in/${coords}`,
				message: 'Gettings stops...'
			});
			if (!response.isError) {
				this.addStopsFromResponse(response.body);
				this.drawStops();
			}
		} else {
			this.removeAllStops();
		}
		this.saveMapState();
	}
	
	saveMapState() {
		const lat = this.map.getCenter().lat.toFixed(5);
		const lng = this.map.getCenter().lng.toFixed(5);
		const zoom = this.map.getZoom().toFixed(1);
		const str = `${lat},${lng},${zoom}`;
		const exp = new Date(Date.now() + 28 * 86400 * 1000).toUTCString();
		window.location.replace(`#${str}`);
		document.cookie = `${this.cookieName}=${str}; SameSite=Strict; Expires=${exp}`;
	}

	loadMapState() {
		// Try URL hash first
		let str = window.location.hash.slice(1);
		let src = 'URL hash';
		// Otherwise try cookie
		if (!str) {
			const cookies = document.cookie.split(';').map(x => x.trim().split('=')).reduce((obj, arr) => { obj[arr[0]] = arr[1]; return obj; }, {} );
			str = cookies[this.cookieName];
			src = 'cookie';
		}
		// Otherwise use defaults
		if (!str) {
			str = '51.486,-0.147,10';
			src = 'defaults';
		}
		if (this.statusMessageManager) {
			this.statusMessageManager.add(`Initial location from ${src}`, this.statusMessageTimeout);
		}
		const arr = str.split(',').map(parseFloat);
		return {
			center: L.latLng(arr[0], arr[1]),
			zoom: arr[2]
		};
	}
	
	addStopsFromResponse(response) {
		this.stops = response;
		this.stops.forEach(function(s) {
			let name = this.titleCase(s.name);
			name = name.replace(/<>/, ' (+Tube)');
			name = name.replace(/>t</i, ' (+Tram)');
			name = name.replace(/>r</i, ' (+River)');
			name = name.replace(/#/, ' (+Rail)');
			name = name.replace(/  /, ' ');
			s.name = name;
		}.bind(this));
	}

	drawStops() {
		// Add any markers not already shown
		this.stops.forEach(function(x) {
			if (!this.stopMarkers.hasOwnProperty(x.lbsl)) {
				const title = `${x.code}\n${x.name}\n${x.routes}\n${x.naptan}`;
				const marker = L.marker([x.lat, x.lng], { title: title });
				marker.lbsl = x.lbsl;
				marker.addTo(this.map);
				this.stopMarkers[x.lbsl] = marker;
				marker.bindPopup(this.getPopupContent(x), { closeButton: false });
			}
		}.bind(this));
		// Remove any markers not listed
		for (const key in this.stopMarkers) {
			if (!this.stops.find(x => x.lbsl == key)) {
				this.map.removeLayer(this.stopMarkers[key]);
				delete this.stopMarkers[key];
			}
		}
	}

	getPopupContent(stop) {
		const div = document.createElement('div');
		// External link to bus timetable
		const a1 = document.createElement('a');
		a1.href = `https://bustimes.org/stops/${stop.naptan}`;
		a1.target = '_blank';
		a1.appendChild(document.createTextNode(`🕒`));
		const b1 = document.createElement('b');
		b1.appendChild(document.createTextNode(stop.code));
		a1.appendChild(b1);
		div.appendChild(a1);
		div.appendChild(document.createElement('br'));
		// Show name
		const b2 = document.createElement('b');
		b2.appendChild(document.createTextNode(stop.name));
		div.appendChild(b2);
		div.appendChild(document.createElement('br'));
		// Internal link to draw spider map
		const a3 = document.createElement('a');
		a3.href = '';
		a3.addEventListener('click', function(evt) {
			evt.preventDefault();
			this.drawSpider(stop);
		}.bind(this));
		a3.appendChild(document.createTextNode('🗺️'));
		const b3 = document.createElement('b');
		const wrapRoutes = stop.routes.replace(/,/g, ',\u200B');
		b3.appendChild(document.createTextNode(wrapRoutes));
		a3.appendChild(b3);
		div.appendChild(a3);
		div.appendChild(document.createElement('br'));
		// Show NAPTAN code
		div.appendChild(document.createTextNode(stop.naptan));
		return div;
	}

	removeAllStops() {
		for (const key in this.stopMarkers) {
			this.map.removeLayer(this.stopMarkers[key]);
			delete this.stopMarkers[key];
		}
	}

	titleCase(str) {
		return str.toLowerCase().split(' ').map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(' ');
	}

	// Start drawing the spider map
	async drawSpider(stop) {
		this.map.closePopup();
		this.routeLayer.clearLayers();
		// Circle the stop so we can find it after zooming out
		L.circleMarker([stop.lat, stop.lng], {
			radius: 75,
			stroke: true,
			fill: false,
			color: 'gray',
			dashArray: '4 8'
		}).addTo(this.routeLayer);
		const response = await this.api.request({
			resource: `/routes/including/lbsl/${stop.lbsl}`,
			message: 'Gettings routes...'
		});
		if (!response.isError) {
			this.routes = {};
			this.addRoutesFromResponse(response.body);
			this.drawRoutes();
		}
	}

	addRoutesFromResponse(src) {
		for (let i = 0; i < src.length; i++) {
			const stop = src[i];
			const prefix1 = stop.route.slice(0,1);
			const prefix2 = stop.route.slice(0,2);
			// Ignore tube and tram replacement services
			if (prefix2 != 'UL' && prefix2 != 'TR') {
				const uid = stop.route + "," + stop.run;
				if (!this.routes.hasOwnProperty(uid)) {
					this.routes[uid] = [];
				}
				this.routes[uid].push(stop);
			}
		}
	}

	assignColorsToRoutes() {
		const dayColors = this.colors.slice();
		const nightColors = this.colors.slice();
		const routeColors = {};
		// Start with night buses
		for (const nightRouteName in this.routes) {
			if (nightRouteName[0] == 'N') {
				const dayRouteName = nightRouteName.slice(1);
				let color = nightColors.shift();
				if (!color) {
					color = 'black';
					alert("No colors left for route " + nightRouteName);
				}
				routeColors[nightRouteName] = color;
				// Use same colour for day equivalent of night bus route, if any
				if (this.routes[dayRouteName]) {
					routeColors[dayRouteName] = color;
				}
				// Night bus colour can't be used for a different daytime route
				dayColors.splice(dayColors.indexOf(color), 1);
			}
		}
		// Now fill in any unassigned day routes
		for (const routeName in this.routes) {
			if (!routeColors[routeName]) {
				let color = dayColors.shift();
				if (!color) {
					color = 'black';
					alert("No colors left for route " + routeName);
				}
				routeColors[routeName] = color;
			}
		}
		return routeColors;
	}

	drawRoutes() {
		const stopLabels = {};
		const labelledStops = [];
		const routeColors = this.assignColorsToRoutes();

		for (const routeName in this.routes) {
			const routeStops = this.routes[routeName];
			const routeNumber = routeStops[0].route;
			// Pick color and line weight
			const color = routeColors[routeName];
			const weight = routeName[0] == 'N' ? 3 : 6;
			// Add polyline joining all stops
			const vertices = routeStops.map(x => [x.lat, x.lng]);
			const line = L.polyline(vertices, {
				color: color,
				weight: weight
			});
			line.addTo(this.routeLayer);
			// Add circles for stops
			routeStops.forEach(function(stop) {
				const circ = L.circle([stop.lat, stop.lng], 10, {
					stroke: true,
					fill: false,
					opacity: 1.0,
					color: color,
					weight: weight
				});
				circ.addTo(this.routeLayer);
			}.bind(this));
			// Add start and end labels to list
			const firstStop = routeStops[0];
			const lastStop = routeStops[routeStops.length-1];
			let style = `color:${color};`;
			if (this.lightColors.includes(color)) {
				style += 'text-shadow: 0px 0px 2px black;';
			}
			if (!stopLabels.hasOwnProperty(firstStop.lbsl)) {
				stopLabels[firstStop.lbsl] = [];
				labelledStops.push(firstStop);
			}
			if (!stopLabels.hasOwnProperty(lastStop.lbsl)) {
				stopLabels[lastStop.lbsl] = [];
				labelledStops.push(lastStop);
			}
			stopLabels[firstStop.lbsl] += `<div class='bustooltip' style='${style}'>${routeNumber} start</div>`;
			stopLabels[lastStop.lbsl] += `<div class='bustooltip' style='${style}'>${routeNumber} end</div>`;
		}
		// Render the start and end labels
		for (const labelName in stopLabels) {
			const stop = labelledStops.find(s => s.lbsl == labelName);
			const label = stopLabels[labelName];
			const circ = L.circle([stop.lat, stop.lng], 1, {
				stroke: false,
				opacity: 0
			}).addTo(this.routeLayer);
			const dirn = this.findEmptiestQuadrant(stop);
			circ.bindTooltip(label, {
				permanent: true,
				direction: dirn
			});
		}
	}

	// For a given stop, which quadrant has the fewest route lines running through it?
	// This is used to position start/end labels away from as many lines as possible
	findEmptiestQuadrant(stop) {
		const nearStops = this.getAdjacentStops(stop);
		let totalX = 0;
		let totalY = 0;
		nearStops.forEach(function(nearby) {
			// Get vector to adjacent stop
			let stopX = nearby.easting - stop.easting;
			let stopY = nearby.northing - stop.northing;
			const magnitude = Math.sqrt(stopX*stopX + stopY*stopY);
			// Normalise vector
			stopX = stopX / magnitude;
			stopY = stopY / magnitude;
			// Add to total vector
			totalX += stopX;
			totalY += stopY
		});
		// Pick quadrant furthest from that vector, with a little bias towards horizontal
		if (Math.abs(totalX * 1.2) > Math.abs(totalY)) {
			return totalX < 0 ? 'right' : 'left';
		} else {
			return totalY < 0 ? 'top' : 'bottom';
		}
	}

	// Across all mapped routes that include the stop provided, return a list of previous/next stops
	getAdjacentStops(stop) {
		const adjStops = [];
		for (const routeName in this.routes) {
			const routeStops = this.routes[routeName];
			const i = routeStops.findIndex(s => s.lbsl == stop.lbsl);
			if (i != -1) {
				// If not at start, get previous stop
				if (i > 0) {
					const adj = routeStops[i-1];
					// Don't add the same stop on multiple routes!
					if (!adjStops.find(x => x.lbsl == adj.lbsl)) {
						adjStops.push(adj);
					}
				}
				// If not at end, get next stop
				if (i < routeStops.length-1) {
					const adj = routeStops[i+1];
					// Don't add the same stop on multiple routes!
					if (!adjStops.find(x => x.lbsl == adj.lbsl)) {
						adjStops.push(adj);
					}
				}
			}
		}
		return adjStops;
	}

}



