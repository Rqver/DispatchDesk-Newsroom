export function convertPolygonsToGeoJSON(polygonStrings: string[]) {
    const features = polygonStrings.map((polyString, i) => {
        const coords = polyString
            .trim()
            .split(" ")
            .map(pair => {
                const [lat, lon] = pair.split(",").map(Number)
                return [lon, lat]
            })

        return {
            type: "Feature",
            properties: {
                name: `Polygon ${i + 1}`
            },
            geometry: {
                type: "Polygon",
                coordinates: [coords]
            }
        }
    })

    return {
        type: "FeatureCollection",
        features
    }
}
