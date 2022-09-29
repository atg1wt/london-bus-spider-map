#!/usr/bin/env python

# Fetch data from TfL API for London Bus Spider Map.
# @version 2022.09.21.01
# @author Tyrone C.
# @copyright © 2022 by the author
# @license MIT
# TfL API terms & conditions at https://tfl.gov.uk/info-for/open-data-users/api-documentation

import os
import requests
import sqlite3
import csv
import pyproj

# Fetch bus stop and route data from TfL feeds
file = requests.get('http://tfl.gov.uk/tfl/syndication/feeds/bus-stops.csv')
open('bus-stops.csv', 'wb').write(file.content)
print("Got bus stop data")
file = requests.get('http://tfl.gov.uk/tfl/syndication/feeds/bus-sequences.csv')
open('bus-sequences.csv', 'wb').write(file.content)
print("Got bus route data")

# Create new SQLite database
if os.path.exists('database-temp.sqlite'):
	os.remove('database-temp.sqlite')
db = sqlite3.connect('database-temp.sqlite')

# Write bus stop info to database
stops_file = open('bus-stops.csv', newline='')
stops_reader = csv.reader(stops_file, delimiter=',')
row_count = sum(1 for row in stops_reader) - 1
stops_file.seek(0)
header = next(stops_reader)
print("Processing", row_count, "bus stops...")
db.execute("CREATE TABLE stops (lbsl TEXT PRIMARY KEY, code TEXT, naptan TEXT, name TEXT, easting INT, northing INT, heading INT, area TEXT, virtual TEXT, lng REAL, lat REAL)")

# Prepare to transform coordinates from OSGB36 to WGS84
osgb36 = pyproj.CRS.from_epsg(27700)
wgs84 = pyproj.CRS.from_epsg(4326)
transformer = pyproj.Transformer.from_crs(osgb36, wgs84)

# Add lat/lng to bus stops
for row in stops_reader:
	(lat, lng) = transformer.transform(row[4], row[5])
	row.append(lng)
	row.append(lat)
	db.execute("INSERT INTO stops VALUES (?,?,?,?,?,?,?,?,?,?,?)", row)
	row_count = row_count - 1
	if row_count % 1000 == 0:
		print(row_count, "stops left")
db.commit()
stops_file.close()

# Write route sequence info to database
seq_file = open('bus-sequences.csv', newline='')
seq_reader = csv.reader(seq_file, delimiter=',')
row_count = sum(1 for row in seq_reader) - 1
seq_file.seek(0)
header = next(seq_reader)
print("Processing", row_count, "bus routes...")
db.execute("CREATE TABLE routes (route TEXT, run INT, sequence INT, lbsl TEXT)")
for row in seq_reader:
	db.execute("INSERT INTO routes VALUES (?,?,?,?)",
		(row[0], row[1], row[2], row[3]))
	row_count = row_count - 1
	if row_count % 1000 == 0:
		print(row_count, "routes left")
db.commit()
seq_file.close()

# Clean up
db.close()
if os.path.exists('database.sqlite'):
	os.remove('database.sqlite')
os.rename('database-temp.sqlite', 'database.sqlite')
print("Complete")

