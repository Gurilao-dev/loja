const express = require('express');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// Criar novo pedido
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { items, shippingAddress, paymentMethod, notes } = req.body;
        const userId = req.user._id;

        // Validar itens do pedido
        if (!items || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Pedido deve conter pelo menos um item'
            });
        }

        // Verificar disponibilidade dos produtos e calcular totais
        let subtotal = 0;
        const orderItems = [];

        for (const item of items) {
            const product = await Product.findById(item.productId);
            
            if (!product || !product.isActive) {
                return res.status(400).json({
                    success: false,
                    message: `Produto ${item.productId} não encontrado ou indisponível`
                });
            }

            if (product.stock < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Estoque insuficiente para ${product.name}. Disponível: ${product.stock}`
                });
            }

            const itemTotal = product.price * item.quantity;
            subtotal += itemTotal;

            orderItems.push({
                product: product._id,
                productName: product.name,
                productImage: product.images[0]?.url || '',
                quantity: item.quantity,
                unitPrice: product.price,
                totalPrice: itemTotal,
                discount: 0
            });
        }

        // Calcular frete (simplificado)
        const shipping = subtotal > 100 ? 0 : 15;
        const total = subtotal + shipping;

        // Criar pedido
        const order = new Order({
            customer: userId,
            customerInfo: {
                name: req.user.name,
                email: req.user.email,
                phone: req.user.phone,
                cpf: req.user.cpf
            },
            items: orderItems,
            subtotal,
            shipping,
            total,
            paymentMethod: paymentMethod || 'dinheiro',
            shippingAddress: shippingAddress || {
                cep: req.user.cep
            },
            notes: notes || ''
        });

        await order.save();

        // Atualizar estoque dos produtos
        for (const item of orderItems) {
            await Product.findByIdAndUpdate(
                item.product,
                { 
                    $inc: { 
                        stock: -item.quantity,
                        sales: item.quantity
                    }
                }
            );
        }

        // Limpar carrinho do usuário
        await Cart.findOneAndUpdate(
            { user: userId },
            { items: [], totalItems: 0, totalPrice: 0 }
        );

        res.status(201).json({
            success: true,
            message: 'Pedido criado com sucesso',
            data: { order }
        });

    } catch (error) {
        console.error('Erro ao criar pedido:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Listar pedidos do usuário
router.get('/my-orders', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 10, status } = req.query;
        const userId = req.user._id;

        const filters = { customer: userId };
        if (status && status !== 'all') {
            filters.status = status;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [orders, total] = await Promise.all([
            Order.find(filters)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .populate('items.product', 'name images')
                .lean(),
            Order.countDocuments(filters)
        ]);

        res.json({
            success: true,
            data: {
                orders,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }
        });

    } catch (error) {
        console.error('Erro ao buscar pedidos:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Obter detalhes de um pedido específico
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.user._id;
        const isAdmin = req.user.type === 'admin';

        const filters = { _id: orderId };
        if (!isAdmin) {
            filters.customer = userId;
        }

        const order = await Order.findOne(filters)
            .populate('items.product', 'name images category')
            .populate('customer', 'name email phone');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Pedido não encontrado'
            });
        }

        res.json({
            success: true,
            data: { order }
        });

    } catch (error) {
        console.error('Erro ao buscar pedido:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Listar todos os pedidos (Admin apenas)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            status, 
            search,
            startDate,
            endDate 
        } = req.query;

        const filters = {};
        
        if (status && status !== 'all') {
            filters.status = status;
        }

        if (search) {
            filters.$or = [
                { orderNumber: { $regex: search, $options: 'i' } },
                { 'customerInfo.name': { $regex: search, $options: 'i' } },
                { 'customerInfo.email': { $regex: search, $options: 'i' } }
            ];
        }

        if (startDate || endDate) {
            filters.createdAt = {};
            if (startDate) filters.createdAt.$gte = new Date(startDate);
            if (endDate) filters.createdAt.$lte = new Date(endDate);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [orders, total] = await Promise.all([
            Order.find(filters)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .populate('customer', 'name email phone')
                .lean(),
            Order.countDocuments(filters)
        ]);

        res.json({
            success: true,
            data: {
                orders,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }
        });

    } catch (error) {
        console.error('Erro ao buscar pedidos:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Atualizar status do pedido (Admin apenas)
router.patch('/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, paymentStatus } = req.body;
        const orderId = req.params.id;

        const updateData = {};
        if (status) updateData.status = status;
        if (paymentStatus) updateData.paymentStatus = paymentStatus;

        if (status === 'entregue') {
            updateData.deliveredAt = new Date();
        }

        if (status === 'cancelado') {
            updateData.canceledAt = new Date();
            // Restaurar estoque dos produtos
            const order = await Order.findById(orderId);
            if (order) {
                for (const item of order.items) {
                    await Product.findByIdAndUpdate(
                        item.product,
                        { 
                            $inc: { 
                                stock: item.quantity,
                                sales: -item.quantity
                            }
                        }
                    );
                }
            }
        }

        const order = await Order.findByIdAndUpdate(
            orderId,
            updateData,
            { new: true }
        ).populate('customer', 'name email phone');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Pedido não encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Status do pedido atualizado com sucesso',
            data: { order }
        });

    } catch (error) {
        console.error('Erro ao atualizar pedido:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

module.exports = router;

