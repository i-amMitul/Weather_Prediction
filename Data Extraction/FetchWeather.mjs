import fetch from "node-fetch";
import requirejs from "requirejs"

const apiKey = "39c3606dee2f4a4f9b5152122212709"// "79f8ca5aa22a46ebb9192046210809"

const getRequestLink = (latLon, startDate, endDate) => (`http://api.worldweatheronline.com/premium/v1/past-weather.ashx?
key=${apiKey}
&q=${latLon}
&format=json
&date=${startDate}
&enddate=${endDate}`);

const startDate = "2009-01-01"
const findLat = 28.645
const findLon = 77.217 // LatLon of Delhi
const city_distance_km = [20, 100, 500] // North South East West len(..) cities are generated

/** For whole day, got directly */
const directParams = {
    "date": (dayData) => dayData["date"],
    "Max Temp (c)": (dayData) => dayData["maxtempC"],
    "Min Temp (c)": (dayData) => dayData["mintempC"],
    "Avg Temp (c)": (dayData) => dayData["avgtempC"],
    "Snow (cm)": (dayData) => dayData["totalSnow_cm"],
    "Sun Time (Hours)": (dayData) => dayData["sunHour"],
    "UV Index": (dayData) => dayData["uvIndex"]
}

/** Derived from hourly, To add more params, insert in this object with value = way of extraction */
const derivedParams = {
    "Total Precipitation (MM)":
        (hourly) => (
            hourly.map((cur) => (parseFloat(cur["precipMM"])))
                .reduce((acc, cur) => acc + cur)
        ),

    "Avg Pressure (P)":
        (hourly) => (
            hourly.map((cur) => (parseFloat(cur["pressure"]) / hourly.length))
                .reduce((acc, cur) => acc + cur)
        ),

    "Avg Humidity (%)":
        (hourly) => (
            hourly.map((cur) => (parseFloat(cur["humidity"]) / hourly.length))
                .reduce((acc, cur) => acc + cur)
        ),

    "Avg Cloud Cover":
        (hourly) => (
            hourly.map((cur) => (parseFloat(cur["cloudcover"]) / hourly.length))
                .reduce((acc, cur) => acc + cur)
        ),

    "Avg Resultant Wind vector [E](km/h)": // Vector addition of hourly winds
        (hourly) => {
            const windVectors = extractWindVectors(hourly);
            const resultant = windVectors.reduce((acc, cur) => ([acc[0] + cur[0], acc[1] + cur[1]]));
            return (resultant.map(k => k / hourly.length))[0]
        },
    "Avg Resultant Wind vector [N](km/h)": // Vector addition of hourly winds
        (hourly) => {
            const windVectors = extractWindVectors(hourly);
            const resultant = windVectors.reduce((acc, cur) => ([acc[0] + cur[0], acc[1] + cur[1]]));
            return (resultant.map(k => k / hourly.length))[1]
        },
}

const fetchAllData = async (latLon, startDate, endDate) => {
    if (endDate < startDate) {
        return null;
    } else {
        const response = await fetch(getRequestLink(latLon, startDate, endDate));
        return await response.json()
    }
}

/** Returns Extracted data and end date */
const processRawData = (rawData) => {
    if (rawData["data"]["error"] !== undefined) {
        console.error("Error Fetching data, received:", rawData["data"]["error"][0])
        return null;
    }
    if (rawData["data"]["request"][0].type !== 'LatLon') {
        console.error("Not a LatLon:", rawData["data"]["request"][0].query)
        return null;
    }
    let extractedData = {
        "dayWiseData": []
    };
    for (let i = 0; i < rawData["data"]["weather"].length; i++) {
        let newInsertion = {};
        extractedData["dayWiseData"].push(newInsertion);
        for (const directParamsKey in directParams) {
            newInsertion[directParamsKey] = directParams[directParamsKey](rawData["data"]["weather"][i])
        }
        for (const derivedParamsKey in derivedParams) {
            newInsertion[derivedParamsKey] = derivedParams[derivedParamsKey](rawData["data"]["weather"][i]["hourly"])
        }
    }
    return [
        extractedData,
        rawData["data"]["weather"]
            [(rawData["data"]["weather"]).length - 1]["date"]
    ]
}

const getAllData = async (latLon) => {
    let nextStart = new Date(startDate.replace( /(\d{2})-(\d{2})-(\d{4})/, "$2/$3/$1"))
    let endDate = new Date();
    let answer = null
    while (nextStart <= endDate) {
        const stringStartDate = nextStart.toISOString().split('T')[0]
        const stringEndDate = endDate.toISOString().split('T')[0]
        let got = processRawData(
            await fetchAllData(latLon, stringStartDate, stringEndDate)
        )
        if (got === null) {
            return null
        } else if (answer === null) {
            answer=got[0];
        } else {
            answer["dayWiseData"] = [...answer["dayWiseData"], ...got[0]["dayWiseData"]]
        }
        nextStart = new Date(got[1].replace( /(\d{2})-(\d{2})-(\d{4})/, "$2/$3/$1"))
        nextStart.setDate(nextStart.getDate() + 1)
        console.log(got[1], latLon)
    }
    return answer
}

const fs = requirejs("fs");
const saveDataFor = async (fileName, latitude, longitude) =>{
    fs.writeFile(`./data/${fileName}.json`, JSON.stringify(await getAllData(
        `${latitude.toFixed(3)},${longitude.toFixed(3)}`)), (err) => {
        if (err)
            console.log(err);
        else {
            console.log("File written successfully\n");
            console.log("The written has the following contents:");
        }
    });
}

/** Main Function */
(async () => {

    //AT GIVEN LAT LON
    await saveDataFor("Delhi", findLat, findLon)

    // At asked Distances
    for (const distanceKey in city_distance_km) {
        let distance = city_distance_km[distanceKey]

        // North
        let newLat = findLat + north_distance_to_latitude_difference(distance)
        await saveDataFor(`North_${distance}`, newLat, findLon)

        // South
        newLat = findLat + north_distance_to_latitude_difference(-distance)
        await saveDataFor(`South_${distance}`, newLat, findLon)

        // East
        let newLon = findLon + east_distance_to_longitude_difference(distance, findLat)
        await saveDataFor(`East_${distance}`, findLat, newLon)

        // West
        newLon = findLon + east_distance_to_longitude_difference(-distance, findLat)
        await saveDataFor(`West_${distance}`, findLat, newLon)
    }
})()


/** UTILITY */
function sinDeg(degree) {
    return Number(Math.sin(degree * Math.PI / 180).toFixed(5));
}

function cosDeg(degree) {
    return Number(Math.cos(degree * Math.PI / 180).toFixed(5));
}

function extractWindVectors(hourly) {
    return hourly.map((cur) => {
        let windD = parseFloat(cur["winddirDegree"]), windS = parseFloat(cur["windspeedKmph"]);
        return [windS * cosDeg(windD), windS * sinDeg(windD)]
    })
}

function east_distance_to_longitude_difference(distance_km, latitude) {
    const R_EARTH = 6378.1 //KM
    const K = Math.pow(Math.tan(distance_km / (2* R_EARTH)), 2)
    console.log(K)
    console.log(K / (Math.pow(cosDeg(latitude), 2)*(K+1)))
    const longitude_diff_rad = 2 * Math.asin(Math.sqrt((K) /
        (Math.pow(cosDeg(latitude), 2)*(K+1))))

    return longitude_diff_rad * 180.0 / Math.PI * Math.sign(distance_km)
}

function north_distance_to_latitude_difference(distance_km) {
    return distance_km / 111.0
}