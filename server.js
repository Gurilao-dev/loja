const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const connectDB = require('./config/database');

// Importar rotas
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const cartRoutes = require('./routes/cart');
const chatRoutes = require('./routes/chat');
const adminRoutes = require('./routes/admin');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Conectar ao MongoDB
connectDB();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir arquivos estáticos do frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);

// Rota para criar usuário admin padrão
app.post('/api/setup/admin', async (req, res) => {
    try {
        const User = require('./models/User');
        
        // Verificar se já existe um admin
        const existingAdmin = await User.findOne({ 
            email: 'lojaadmin@loja.app' 
        });

        if (existingAdmin) {
            return res.json({
                success: true,
                message: 'Admin já existe'
            });
        }

        // Criar admin
        const admin = new User({
            name: 'Administrador',
            email: 'lojaadmin@loja.app',
            password: 'password123',
            phone: '(11) 99999-9999',
            cpf: '000.000.000-00',
            cep: '00000-000',
            type: 'admin'
        });

        await admin.save();

        res.json({
            success: true,
            message: 'Admin criado com sucesso',
            data: {
                email: 'lojaadmin@loja.app',
                password: 'password123'
            }
        });

    } catch (error) {
        console.error('Erro ao criar admin:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao criar admin',
            error: error.message
        });
    }
});

// Rota para popular produtos de exemplo
app.post('/api/setup/products', async (req, res) => {
    try {
        const Product = require('./models/Product');
        
        // Verificar se já existem produtos
        const existingProducts = await Product.countDocuments();
        if (existingProducts > 0) {
            return res.json({
                success: true,
                message: 'Produtos já existem'
            });
        }

        const sampleProducts = [
            {
                name: 'Fita Isolante 3M Imperial 18mm X 20m',
                description: 'Fita isolante de alta qualidade da 3M, ideal para isolamento elétrico e vedação. Resistente à umidade e temperatura.',
                price: 46.38,
                stock: 50,
                category: 'eletrica',
                subcategory: 'fitas',
                brand: '3M',
                images: [{
                    url: 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=400',
                    alt: 'Fita Isolante 3M',
                    isPrimary: true
                }],
                specifications: {
                    dimensions: '18mm x 20m',
                    material: 'PVC',
                    color: 'Preta',
                    warranty: '12 meses'
                },
                rating: { average: 4.8, count: 2333 },
                tags: ['fita', 'isolante', '3m', 'eletrica']
            },
            {
                name: 'Isoflex Fita Isolante Anti Chama 19mm x 20m',
                description: 'Fita isolante anti-chama de alta performance, ideal para instalações elétricas profissionais.',
                price: 43.12,
                stock: 30,
                category: 'eletrica',
                subcategory: 'fitas',
                brand: 'Isoflex',
                images: [{
                    url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400',
                    alt: 'Fita Isolante Isoflex',
                    isPrimary: true
                }],
                specifications: {
                    dimensions: '19mm x 20m',
                    material: 'PVC Anti-chama',
                    color: 'Azul/Vermelha',
                    warranty: '12 meses'
                },
                rating: { average: 4.8, count: 137 },
                tags: ['fita', 'isolante', 'anti-chama', 'isoflex']
            },
            {
                name: 'Fita Isolante 3M Scotch 35+ 19mm X 20m Amarela',
                description: 'Fita isolante premium da 3M Scotch, cor amarela, ideal para identificação e isolamento elétrico.',
                price: 38.75,
                originalPrice: 62.00,
                discount: 37,
                stock: 25,
                category: 'eletrica',
                subcategory: 'fitas',
                brand: '3M',
                images: [{
                    url: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=400',
                    alt: 'Fita Isolante 3M Amarela',
                    isPrimary: true
                }],
                specifications: {
                    dimensions: '19mm x 20m',
                    material: 'PVC',
                    color: 'Amarela',
                    warranty: '12 meses'
                },
                rating: { average: 4.8, count: 32 },
                tags: ['fita', 'isolante', '3m', 'amarela', 'scotch']
            },
            {
                name: 'Cabo Flexível 2,5mm² 100m - Amarelo',
                description: 'Cabo flexível de cobre para instalações elétricas residenciais e comerciais.',
                price: 89.90,
                stock: 15,
                category: 'eletrica',
                subcategory: 'cabos',
                brand: 'Cobrecom',
                images: [{
                    url: 'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=400',
                    alt: 'Cabo Flexível Amarelo',
                    isPrimary: true
                }],
                specifications: {
                    voltage: '750V',
                    material: 'Cobre',
                    color: 'Amarelo',
                    dimensions: '2,5mm² - 100m'
                },
                rating: { average: 4.5, count: 89 },
                tags: ['cabo', 'flexivel', 'cobre', 'amarelo', 'eletrica']
            },
            {
                name: 'Disjuntor Bipolar 32A - DIN',
                description: 'Disjuntor bipolar de 32A padrão DIN para proteção de circuitos elétricos.',
                price: 45.50,
                stock: 40,
                category: 'eletrica',
                subcategory: 'protecao',
                brand: 'Schneider',
                images: [{
                    url: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400',
                    alt: 'Disjuntor Bipolar',
                    isPrimary: true
                }],
                specifications: {
                    voltage: '220V/380V',
                    current: '32A',
                    poles: '2',
                    standard: 'DIN'
                },
                rating: { average: 4.7, count: 156 },
                tags: ['disjuntor', 'bipolar', '32a', 'din', 'protecao']
            },
            {
                name: 'Cimento Portland CP II-E-32 50kg',
                description: 'Cimento Portland de alta qualidade para construção civil e obras em geral.',
                price: 28.90,
                stock: 100,
                category: 'material-construcao',
                subcategory: 'cimento',
                brand: 'Votorantim',
                images: [{
                    url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400',
                    alt: 'Cimento Portland',
                    isPrimary: true
                }],
                specifications: {
                    weight: '50kg',
                    type: 'CP II-E-32',
                    material: 'Cimento Portland'
                },
                rating: { average: 4.6, count: 234 },
                tags: ['cimento', 'portland', 'construcao', 'votorantim']
            }
        ];

        await Product.insertMany(sampleProducts);

        res.json({
            success: true,
            message: 'Produtos de exemplo criados com sucesso',
            data: { count: sampleProducts.length }
        });

    } catch (error) {
        console.error('Erro ao criar produtos:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao criar produtos',
            error: error.message
        });
    }
});

// Socket.IO para chat em tempo real
const Message = require('./models/Message');
const User = require('./models/User');

io.on('connection', (socket) => {
    console.log('Usuário conectado:', socket.id);

    // Entrar em uma conversa
    socket.on('join_conversation', (conversationId) => {
        socket.join(conversationId);
        console.log(`Socket ${socket.id} entrou na conversa ${conversationId}`);
    });

    // Enviar mensagem
    socket.on('send_message', async (data) => {
        try {
            const { conversationId, senderId, recipientId, content, type = 'text' } = data;

            // Buscar informações do remetente
            const sender = await User.findById(senderId);
            if (!sender) {
                socket.emit('error', { message: 'Usuário não encontrado' });
                return;
            }

            // Criar mensagem
            const message = new Message({
                conversation: conversationId,
                sender: senderId,
                senderInfo: {
                    name: sender.name,
                    type: sender.type
                },
                recipient: recipientId,
                content,
                type,
                status: 'sent'
            });

            await message.save();

            // Enviar mensagem para todos na conversa
            io.to(conversationId).emit('new_message', {
                _id: message._id,
                conversation: message.conversation,
                sender: {
                    _id: sender._id,
                    name: sender.name,
                    type: sender.type
                },
                content: message.content,
                type: message.type,
                status: message.status,
                createdAt: message.createdAt
            });

        } catch (error) {
            console.error('Erro ao enviar mensagem:', error);
            socket.emit('error', { message: 'Erro ao enviar mensagem' });
        }
    });

    // Marcar mensagem como lida
    socket.on('mark_as_read', async (data) => {
        try {
            const { messageId, userId } = data;

            await Message.findByIdAndUpdate(messageId, {
                status: 'read',
                readAt: new Date()
            });

            socket.broadcast.emit('message_read', { messageId, userId });

        } catch (error) {
            console.error('Erro ao marcar mensagem como lida:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log('Usuário desconectado:', socket.id);
    });
});

// Rota catch-all para SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Acesse: http://localhost:${PORT}`);
});

module.exports = app;

