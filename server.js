/* https://github.com/r00t1024 */

const express = require('express');
const axios = require('axios');
const https = require('https');

const app = express();
const PORT = 3000;

// --- Tiny XML escape helper ---
function escapeXml(str) {
    if (str === undefined || str === null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// --- Routes ---
app.get('/widget/samsungmobile/city-find.asp', (req, res) => {
    console.log(req.originalUrl);

    // ?location=CITY
    var locationQuery = req.query.location;

    if (!locationQuery) {
        res.send("");
        return;
    }

    var apiUrl = 'https://geocoding-api.open-meteo.com/v1/search'
        + '?name=' + encodeURIComponent(locationQuery)
        + '&count=10'
        + '&language=en'
        + '&format=json';

    https.get(apiUrl, function (apiRes) {
        var raw = '';

        apiRes.on('data', function (chunk) {
            raw += chunk;
        });

        apiRes.on('end', function () {
            var json;

            try {
                json = JSON.parse(raw);
            } catch (e) {
                // Bad JSON from upstream -> return empty list
                res.send("bad json");
                return;
            }

            var xml = buildLocListXml(json);

            res.set('Content-Type', 'text/xml; charset=windows-1252');
            res.send(xml);
        });
    }).on('error', function (err) {
        console.error('Upstream request failed:', err.message);
        res.send("");
    });
});

app.get('/widget/samsungmobile/weather-data.asp', (req, res) => {
    console.log(req.originalUrl);
    
    // ?location=CITY
    var locationQuery = decodeURIComponent(req.query.location);

    if (!locationQuery) {
        res.send("");
        return;
    }
    
    var latlon = locationQuery.split("|");
    var lat = latlon[0];
    var lon = latlon[1];

    var apiUrl = 'https://api.open-meteo.com/v1/forecast'
        + '?latitude=' + lat
        + '&longitude=' + lon
        + '&daily=weather_code,temperature_2m_max,temperature_2m_min&current=temperature_2m,weather_code&timezone=auto';

    https.get(apiUrl, function (apiRes) {
        var raw = '';

        apiRes.on('data', function (chunk) {
            raw += chunk;
        });

        apiRes.on('end', function () {
            var json;

            try {
                json = JSON.parse(raw);
            } catch (e) {
                // Bad JSON from upstream -> return empty list
                console.log("bad json");
                res.send("");
                return;
            }

            var xml = buildForecastXml(json);

            res.set('Content-Type', 'text/xml; charset=windows-1252');
            res.send(xml);
        });
    }).on('error', function (err) {
        console.error('Upstream request failed:', err.message);
        res.send("");
    });
});

// TODO: complete this call for making map work.
app.get('/widget/samsungmobile/briefing_weather.asp', (req, res) => {
    console.log(req.originalUrl);
    
    res.send("");
});

app.get(/.*/, (req, res) => {
    console.log("Called non-existing function:");
    console.log(req.originalUrl);
    res.send("<html><meta http-equiv=\"refresh\" content=\"0; URL='https://google.com'\" /></html>");
});


// --- Helper functions ---

function buildLocListXml(json) {
    var results = json.results || [];
    
    var usCount = 0;
    var intlCount = 0;
    var lines = [];
    var cnt = 1;

    for (var i = 0; i < results.length; i++) {
        var result = results[i];

        var countryCode = result.country_code || 'UNKNOWN';
        var isUS = (countryCode === 'US');

        var stateValue;

        if (isUS) {
            // e.g. "Arkansas" / "New York" / "Pennsylvania"
            stateValue = result.admin1 || '';
        } else {
            // e.g. "Italy (Lombardy)" -> "Country (Admin1)"
            var country = result.country || '';
            var admin1 = result.admin1 || '';
            if (admin1) {
                stateValue = country + ' (' + admin1 + ')';
            } else {
                stateValue = country;
            }
        }
        
        var locationValue;

        // latitude / longitude
        var lat = (result.latitude !== undefined) ? result.latitude : 0;
        var lon = (result.longitude !== undefined) ? result.longitude : 0;
        
        if(lat != 0 && lon != 0)
            locationValue = lat + "|" + lon;
        else
            return "";

        lines.push(
            '  <location cnt="' + cnt + '"'
            + ' city="' + escapeXml(result.name) + '"'
            + ' state="' + escapeXml(stateValue) + '"'
            + ' location="' + escapeXml(locationValue) + '"'
            + ' latitude="' + lat + '"'
            + ' longitude="' + lon + '"/>'
        );

        if (isUS) {
            usCount++;
        } else {
            intlCount++;
        }

        cnt++;
    }

    // Assemble the whole document
    var out = [];
    out.push('<?xml version="1.0" encoding="windows-1252"?>');
    out.push('<adc_database xmlns="http://www.accuweather.com">');
    out.push('<citylist us="' + usCount + '" intl="' + intlCount + '" extra_cities="0">');
    out.push(lines.join('\n'));
    out.push('</citylist>');
    out.push('</adc_database>');

    return out.join('\n');
}

function buildForecastXml(json) {
    var lat   = json.latitude || "";
    var lon   = json.longitude || "";
    var isDay = json.current.is_day;
    var TZ    = json.timezone_abbreviation.split("+")[1];
    isDay = (isDay == 1) ? true : false;
    
    var currentTime = json.current.time.split("T")[1];
    var currentTemp = json.current.temperature_2m;
    var currentCode = json.current.weather_code;
    currentTemp = Math.round(currentTemp);
    
    // TODO: UNITS

    var days = [];
    var daily = json.daily;
    var maxTemps      = daily.temperature_2m_max;
    var minTemps      = daily.temperature_2m_min;
    var weather_codes = daily.weather_code;
    
    for (var dayNumber = 0; dayNumber < 7; dayNumber++) {
        var highT = maxTemps[dayNumber];
        var lowT  = minTemps[dayNumber];
        var code  = weather_codes[dayNumber];
        highT = Math.round(highT);
        lowT  = Math.round(lowT);

        days.push(
            '<day number="' + (dayNumber+1) + '">'
            + '<daytime>'
            + '<weathericon>' + mapWeatherCode(code, true) + '</weathericon>'
            + '<hightemperature>' + highT + '</hightemperature>'
            + '<lowtemperature>' + lowT + '</lowtemperature>'
            + '</daytime>'
            + ' </day>');
    };
        
    var out = [];
    out.push('<?xml version="1.0" encoding="UTF-8"?>');
    out.push('<adc_database xmlns="http://www.accuweather.com">');
    out.push('<local>');
    out.push('<lat>' + lat + '</lat>');
    out.push('<lon>' + lon + '</lon>');
    out.push('<time>' + currentTime + '</time>');
    out.push('<obsDaylight>\n' + 0 + '\n</obsDaylight>'); // TODO: what is this?
    out.push('<currentGmtOffset>' + TZ + '</currentGmtOffset>');
    out.push('</local>');
    out.push('<currentconditions>');
    out.push('<temperature>' + currentTemp + '</temperature>');
    out.push('<weathericon>' + mapWeatherCode(currentCode, isDay) + '</weathericon>');
    out.push('</currentconditions>');
    out.push('<forecast>');
    out.push(days.join('\n'));
    out.push('</forecast>');
    out.push('</adc_database>');

    return out.join('\n');
}

// Map Open-Meteo weather codes to AccuWeather icon numbers.
// Open-Meteo doesn't distinguish day/night, so we pass `isDay` and pick
// the day (1–29) or night (33–44) variant to match AccuWeather's convention.
function mapWeatherCode(openMeteoCode, isDay) {
    const day = {
        0: 1,    // Clear sky        -> Sunny
        1: 2,    // Mainly clear     -> Mostly sunny
        2: 3,    // Partly cloudy    -> Partly sunny
        3: 7,    // Overcast         -> Cloudy
        45: 11,  // Fog              -> Fog
        48: 11,  // Rime fog         -> Fog
        51: 12,  // Light drizzle    -> Showers
        53: 12,  // Moderate drizzle -> Showers
        55: 18,  // Dense drizzle    -> Rain
        56: 26,  // Freezing drizzle -> Freezing rain
        57: 26,  // Freezing drizzle -> Freezing rain
        61: 12,  // Slight rain      -> Showers
        63: 18,  // Moderate rain    -> Rain
        65: 18,  // Heavy rain       -> Rain
        66: 26,  // Freezing rain    -> Freezing rain
        67: 26,  // Freezing rain    -> Freezing rain
        71: 19,  // Slight snow      -> Flurries
        73: 22,  // Moderate snow    -> Snow
        75: 22,  // Heavy snow       -> Snow
        77: 19,  // Snow grains      -> Flurries
        80: 12,  // Slight showers   -> Showers
        81: 12,  // Mod. showers     -> Showers
        82: 18,  // Violent showers  -> Rain
        85: 19,  // Slight snow shwr -> Flurries
        86: 22,  // Heavy snow shwr  -> Snow
        95: 15,  // Thunderstorm     -> T-storms
        96: 15,  // T-storm + hail   -> T-storms
        97: 15,  // Heavy T-storm    -> T-storms
        99: 15,  // T-storm + hail   -> T-storms
    };

    const night = {
        0: 33,   // Clear sky        -> Clear
        1: 34,   // Mainly clear     -> Mostly clear
        2: 35,   // Partly cloudy    -> Partly cloudy
        3: 38,   // Overcast         -> Mostly cloudy
        45: 11,  // Fog              -> Fog (no night variant)
        48: 11,  // Rime fog         -> Fog
        51: 12,  // Light drizzle    -> Showers (shared)
        53: 12,  // Moderate drizzle -> Showers
        55: 18,  // Dense drizzle    -> Rain (shared)
        56: 26,  // Freezing drizzle -> Freezing rain (shared)
        57: 26,  // Freezing drizzle -> Freezing rain
        61: 12,  // Slight rain      -> Showers
        63: 18,  // Moderate rain    -> Rain
        65: 18,  // Heavy rain       -> Rain
        66: 26,  // Freezing rain    -> Freezing rain
        67: 26,  // Freezing rain    -> Freezing rain
        71: 19,  // Slight snow      -> Flurries (shared)
        73: 22,  // Moderate snow    -> Snow (shared)
        75: 22,  // Heavy snow       -> Snow
        77: 19,  // Snow grains      -> Flurries
        80: 12,  // Slight showers   -> Showers
        81: 12,  // Mod. showers     -> Showers
        82: 18,  // Violent showers  -> Rain
        85: 19,  // Slight snow shwr -> Flurries
        86: 22,  // Heavy snow shwr  -> Snow
        95: 15,  // Thunderstorm     -> T-storms (shared)
        96: 15,  // T-storm + hail   -> T-storms
        97: 15,  // Heavy T-storm    -> T-storms
        99: 15,  // T-storm + hail   -> T-storms
    };

    const table = isDay ? day : night;
    return table[openMeteoCode] ?? (isDay ? 7 : 38); // fallback: Cloudy
}


app.listen(PORT, function () {
    console.log('Listening on http://localhost:' + PORT);
});
