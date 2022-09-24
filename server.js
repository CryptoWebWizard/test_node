const express = require('express');
const mysql = require('mysql');
const http = require('http');
const {Server} = require("socket.io");
const axios = require('axios');
const CONSTANTS = require("constants");
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const qs = require('qs');

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'crypto_prices',
    port: 3306
}

const connection = mysql.createConnection(dbConfig);
connection.connect((err) => {
    if (err) {
        console.log(err);
        process.exit(1);
    } else {
        console.log('Connected to database');
    }
})

const sql_query = async (query, params) => new Promise((resolve, reject) => {
    let finalQuery = connection.query(query, params, (error, result) => {
        // console.log(finalQuery.sql)
        if (error) {
            reject(error);
            return;
        }
        resolve(result);
    });
})


const convertDecimal = (amount) => {
    let price = amount.toString();
    let new_price = price.slice(0, (price.indexOf(".")) + 1);
    let con_num = Number(new_price);
    let final_num = con_num === 0 ? Number(price).toFixed(8) : Number(price).toFixed(2);
    return final_num;
}


var apiConfig = {
    method: 'post',
    url: 'https://dev.pixelsoftwares.com/api.php',
    headers: {
        'token': 'ab4086ecd47c568d5ba5739d4078988f',
        'Content-Type': 'application/x-www-form-urlencoded'
    },
    data: qs.stringify({
        'symbol': 'BTCUSDT'
    })
};

setInterval(() => {
    axios(apiConfig)
        .then(function (response) {
            const data1 = response.data;
            const data = data1.data;
            console.log(data);
            const symbol = data.symbol;
            const bidPrice = data.bidPrice;
            const bidQty = data.bidQty;
            const askPrice = data.askPrice;
            const askQty = data.askQty;
            const time = data.time;

            let checkSymbol = `SELECT *
                               FROM price_master
                               WHERE symbol = ?
                               ORDER BY id LIMIT 1`;
            connection.query(checkSymbol, [symbol], async (err, result) => {
                if (!err) {
                    if (result.length > 0) {
                        let record = result[0];
                        let id = record.id;
                        let updateQuery = "UPDATE `price_master` SET ? WHERE `id` = ?";
                        let updateData = {
                            symbol: symbol,
                            bidPrice: convertDecimal(bidPrice),
                            bidQty: bidQty,
                            askPrice: convertDecimal(askPrice),
                            askQty: askQty,
                            time: time
                        }

                        io.to(symbol).emit('subscribed', {
                            symbol: symbol,
                            data: updateData
                        })

                        try {
                            let data = await sql_query(updateQuery, [updateData, id]);
                            console.log(data.affectedRows + " record(s) updated");
                        } catch (e) {
                            console.log(e);
                        }
                    } else {
                        let insertQuery = "INSERT INTO `price_master` SET ?";
                        let insertData = {
                            symbol: symbol,
                            bidPrice: convertDecimal(bidPrice),
                            bidQty: bidQty,
                            askPrice: convertDecimal(askPrice),
                            askQty: askQty,
                            time: time
                        }

                        io.to(symbol).emit('subscribed', {
                            symbol: symbol,
                            data: insertData
                        })

                        try {
                            let data = await sql_query(insertQuery, insertData);
                            console.log(data.insertId + " record(s) inserted");
                        } catch (e) {
                            console.log(e);
                        }
                    }
                } else {
                    console.log(err);
                }
            })


        })
        .catch(function (error) {
            console.log(error);
        });
}, 1000 * 30);



app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

io.on("connection", async (user_socket) => {
    console.log("Client User Socket Connected:- ", user_socket.id);
    user_socket.on("subscribe", (symbol) => {
        symbol = symbol.split(",");

        symbol.map(function (symbol) {
            symbol = symbol.trim();
            user_socket.join(symbol);
        });

        let sql = "SELECT * FROM price_master WHERE symbol IN (?)";
        connection.query(sql, [symbol], (err, result) => {
            if (!err) {
                console.log(result[0]);
                io.to(symbol).emit('subscribed', {
                    symbol: symbol,
                    data: result[0]
                })
            }
        });

    });
});

app.use(express.json())
app.use(express.urlencoded({extended: false}));


server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});