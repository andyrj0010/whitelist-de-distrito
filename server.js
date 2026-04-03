require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');

const app = express();

// 🔥 IMPORTANTE PARA RENDER
app.set('trust proxy', 1);

// 🔥 FUNCIÓN WEBHOOK DISCORD
const sendToDiscord = async (data) => {
    try {
        await axios.post(process.env.WEBHOOK_URL, {
            embeds: [
                {
                    title: "📄 Nueva solicitud de Whitelist",
                    color: 5814783,
                    fields: [
                        {
                            name: "👤 Usuario",
                            value: data.user.discriminator !== "0"
                                ? `${data.user.username}#${data.user.discriminator}`
                                : data.user.username,
                            inline: true
                        },
                        {
                            name: "🆔 ID Discord",
                            value: data.user.id,
                            inline: true
                        },
                        {
                            name: "🎭 Nombre IC",
                            value: data.nombre || "No especificado",
                        },
                        {
                            name: "🎂 Edad IC",
                            value: data.edad || "No especificado",
                        },
                        {
                            name: "📖 Historia",
                            value: data.historia
                                ? data.historia.substring(0, 1000)
                                : "No especificado",
                        }
                    ],
                    footer: {
                        text: "Sistema de Whitelist"
                    },
                    timestamp: new Date()
                }
            ]
        });
    } catch (err) {
        console.error("❌ Error enviando a Discord:", err.response?.data || err.message);
    }
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true // 🔥 IMPORTANTE PARA HTTPS (Render)
    }
}));

app.use(express.static(path.join(__dirname, 'public')));

// 🔐 LOGIN DISCORD
app.get('/login', (req, res) => {
    const redirect = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${process.env.REDIRECT_URI}&response_type=code&scope=identify`;
    res.redirect(redirect);
});

// 🔄 CALLBACK DISCORD
app.get('/callback', async (req, res) => {
    const code = req.query.code;

    if (!code) return res.send("❌ No se recibió código de Discord");

    try {
        const tokenRes = await axios.post('https://discord.com/api/oauth2/token',
            new URLSearchParams({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: process.env.REDIRECT_URI
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        const userRes = await axios.get('https://discord.com/api/users/@me', {
            headers: {
                Authorization: `Bearer ${tokenRes.data.access_token}`
            }
        });

        req.session.user = userRes.data;

        res.redirect('/dashboard.html');

    } catch (err) {
        console.error("❌ Error OAuth:", err.response?.data || err.message);
        res.send('Error al iniciar sesión con Discord');
    }
});

// 🔒 MIDDLEWARE AUTH
function checkAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/');
    next();
}

// 👤 OBTENER USUARIO
app.get('/api/user', checkAuth, (req, res) => {
    res.json(req.session.user);
});

// 📩 WHITELIST
let solicitudes = [];

app.post('/api/whitelist', checkAuth, async (req, res) => {
    const data = {
        user: req.session.user,
        ...req.body
    };

    const yaExiste = solicitudes.find(s => s.user.id === data.user.id);
    if (yaExiste) {
        return res.json({ success: false, message: "Ya enviaste una solicitud" });
    }

    solicitudes.push(data);

    console.log("📄 Nueva solicitud:", data);

    await sendToDiscord(data);

    res.json({ success: true });
});

// 🚪 LOGOUT
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// 🚀 IMPORTANTE: PUERTO DINÁMICO (RENDER)
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("🌐 Servidor corriendo en puerto " + PORT);
});