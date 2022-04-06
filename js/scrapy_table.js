document.querySelector('#boton').addEventListener('click', traerDatos());

function traerDatos(){
    const xhttp = new XMLHttpRequest();

    xhttp.open('get', "https://app.zyte.com/api/v2/datasets/tjFcwQcD9Zk/download?format=json", true);
    xhttp.send();
    xhttp.onreadystatechange = function(){
        if(this.readyState == 4 && this.status ==200){
            let datos = JSON.parse(this.responseText)   
            let table1 = document.querySelector('.container-table1');
            let table2 = document.querySelector('.container-table2');
            
            

            for (let item of datos){     
                for (i = 0; i < 14; i++){

                        
                table1.innerHTML += `                
                    <div class="table__item" id="a1">${item.posiciones[i]} </div>
                    <div class="table__item" id="a2">${item.equipos[i]}</div>
                    <div class="table__item" id="a3">${item.puntos[i]}</div>
                    <div class="table__item" id="a4">${item.pj[i]}</div>
                    <div class="table__item" id="a5">${item.pg[i]}</div>
                    <div class="table__item" id="a6">${item.pe[i]}</div>
                    <div class="table__item" id="a7">${item.pp[i]}</div>
                    <div class="table__item" id="a8">${item.gf[i]}</div>
                    <div class="table__item" id="a9">${item.gc[i]}</div>
                    <div class="table__item" id="a10">${item.dif[i]}</div>
                `
            }};   
            

            for (let item of datos){     
                for (i = 14; i < 28; i++){

                        
                table2.innerHTML += `                
                    <div class="table__item" id="a1">${item.posiciones[i]} </div>
                    <div class="table__item" id="a2">${item.equipos[i]}</div>
                    <div class="table__item" id="a3">${item.puntos[i]}</div>
                    <div class="table__item" id="a4">${item.pj[i]}</div>
                    <div class="table__item" id="a5">${item.pg[i]}</div>
                    <div class="table__item" id="a6">${item.pe[i]}</div>
                    <div class="table__item" id="a7">${item.pp[i]}</div>
                    <div class="table__item" id="a8">${item.gf[i]}</div>
                    <div class="table__item" id="a9">${item.gc[i]}</div>
                    <div class="table__item" id="a10">${item.dif[i]}</div>
                `
            }};   
        }
    }

}



