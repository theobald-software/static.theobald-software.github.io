document.addEventListener("DOMContentLoaded", async () => {
    let yunioClient = await import(
        "https://static.theobald-software.com/theobald.yunio.client.js/dist/theobald.yunio.client.js"
    );

    yunioClient.TheobaldYunioClient.initializeLiveCombobox({
        $: NWF$,
        controls: {
            inputId: inputMaterial,
            selectId: selectMaterial,
            outputId: outputMaterialId
            /*descriptionId: outputMaterialDescription*/
            /*buttonId: 'buttonId'*/
        },
        tableSettings: {
            serviceName: "MAKTService",
            idField: "MATNR",
            descriptionField: "MAKTX",
            language: "E"
        },
        connection: {
            url: "https://yunioservices.YOURDOMAIN.com:8175/",
            /* future apiKey */
            username: "yunioAdmin",
            password: prompt('yunIO password', '')
        }
    });
});