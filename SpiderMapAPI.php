<?php
/**
 * REST-ish API for London Bus Spider Map
 * @version 2022.09.26.01
 * @author Tyrone C.
 * @copyright © 2022 by the author
 * @license MIT
 */

// Get request verb, URL, POSTed payload if any
$method = $_SERVER['REQUEST_METHOD'];
$resource = $_SERVER['QUERY_STRING'];
$components = array_values(array_filter(explode('/', $resource)));
$count = count($components);

$dbFile = 'database.sqlite';

// Open database
if (!file_exists($dbFile)) {
	die("$dbFile not found");
}
$db = new PDO("sqlite:$dbFile");

// GET /stops
if ($method == 'GET' && $count == 1 && $components[0] == 'stops') {
	$st = $db->prepare('SELECT * FROM stops');
	$st->execute();
	$results = $st->fetchall(PDO::FETCH_ASSOC);
	echo(json_encode($results));
	exit();
}

// GET /stops/code/[nnnnn]
if ($method == 'GET' && $count == 3 && $components[0] == 'stops' && $components[1] == 'code') {
	$st = $db->prepare('SELECT * FROM stops WHERE code=?');
	$st->execute( array( $components[2] ) );
	$results = $st->fetchall(PDO::FETCH_ASSOC);
	echo(json_encode($results));
	exit();
}

// GET /stops/in/[low lat,lng]/[high lat,lng]
if ($method == 'GET' && $count == 4 && $components[0] == 'stops' && $components[1] == 'in') {
	$low = explode(',', $components[2]);
	$high = explode(',', $components[3]);
	$lowLng = (float)$low[0];
	$lowLat = (float)$low[1];
	$highLng = (float)$high[0];
	$highLat = (float)$high[1];
	$st = $db->prepare("SELECT stops.*, group_concat(routes.route, ',') AS routes FROM stops INNER JOIN routes ON stops.lbsl=routes.lbsl WHERE lat>? AND lat<? AND lng>? AND lng<? GROUP BY stops.lbsl");
	$st->execute( array($lowLat, $highLat, $lowLng, $highLng) );
	$results = $st->fetchall(PDO::FETCH_ASSOC);
	echo(json_encode($results));
	exit();
}

// GET /routes
if ($method == 'GET' && $count == 1 && $components[0] == 'routes' ) {
	$st = $db->prepare('SELECT * FROM routes');
	$st->execute();
	$results = $st->fetchall(PDO::FETCH_ASSOC);
	echo(json_encode($results));
	exit();
}

// GET /routes/including/lbsl/[xxxx]
if ($method == 'GET' && $count == 4 && $components[0] == 'routes' && $components[1] == 'including' && $components[2] == 'lbsl') {
	$st = $db->prepare("SELECT a.route,a.run,a.sequence,stops.* FROM routes a INNER JOIN routes b ON a.route=b.route AND a.run=b.run INNER JOIN stops ON a.lbsl=stops.lbsl WHERE b.lbsl=? ORDER BY a.route DESC,a.run,a.sequence");
	$st->execute( array($components[3]) );
	$results = $st->fetchall(PDO::FETCH_ASSOC);
	echo(json_encode($results));
	exit();
}

// Fallthrough for unrecognised resources

http_response_code(400);
echo("Error " . http_response_code());

?>
