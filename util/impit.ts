import { Impit } from "npm:impit";

const impit = new Impit({
    browser: "chrome",
    ignoreTlsErrors: true,
    followRedirects: true
})

export default impit;