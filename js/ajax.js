document.querySelector('#boton').addEventListener('click', traerDatos());

function traerDatos(){
    console.log('dentro de la funcion')

    const xhttp = new XMLHttpRequest();

    xhttp.open('get', 'table_position.json', true);
    xhttp.send();
    xhttp.onreadystatechange = function(){
        if(this.readyState == 4 && this.status ==200){
            let datos = JSON.parse(this.responseText)   
            let table1 = document.querySelector('#table1');
            let table2 = document.querySelector('#table2');
            
            table1.innerHTML = '';

            for (let item of datos){     
                for (i = 0; i < 14; i++){

                        
                table1.innerHTML += `
                <tr>
                    <td>${item.posiciones[i]} </td>
                    <td>${item.equipos[i]}</td>
                    <td>${item.puntos[i]}</td>
                    <td>${item.pj[i]}</td>
                    <td>${item.pg[i]}</td>
                    <td>${item.pe[i]}</td>
                    <td>${item.pp[i]}</td>
                    <td>${item.gf[i]}</td>
                    <td>${item.gc[i]}</td>
                    <td>${item.dif[i]}</td>                    
                </tr>
                `
            }};   
            table2.innerHTML = '';

            for (let item of datos){     
                for (i = 14; i < 28; i++){

                        
                table2.innerHTML += `
                <tr>
                    <td>${item.posiciones[i]} </td>
                    <td>${item.equipos[i]}</td>
                    <td>${item.puntos[i]}</td>
                    <td>${item.pj[i]}</td>
                    <td>${item.pg[i]}</td>
                    <td>${item.pe[i]}</td>
                    <td>${item.pp[i]}</td>
                    <td>${item.gf[i]}</td>
                    <td>${item.gc[i]}</td>
                    <td>${item.dif[i]}</td>                    
                </tr>
                `
            }};   
        }
    }

}



