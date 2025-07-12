const express = require('express');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Message = require('../models/Message');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// Dashboard - Estatísticas gerais
router.get('/dashboard', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [
            totalUsers,
            totalProducts,
            totalOrders,
            totalRevenue,
            pendingOrders,
            recentOrders,
            topProducts,
            unreadMessages
        ] = await Promise.all([
            User.countDocuments({ type: 'cliente' }),
            Product.countDocuments({ isActive: true }),
            Order.countDocuments(),
            Order.aggregate([
                { $match: { status: { $ne: 'cancelado' } } },
                { $group: { _id: null, total: { $sum: '$total' } } }
            ]),
            Order.countDocuments({ status: 'pendente' }),
            Order.find()
                .sort({ createdAt: -1 })
                .limit(5)
                .populate('customer', 'name email')
                .lean(),
            Product.find({ isActive: true })
                .sort({ sales: -1 })
                .limit(5)
                .select('name sales price images')
                .lean(),
            Message.countDocuments({ 
                recipient: { $exists: true },
                status: { $ne: 'read' }
            })
        ]);

        const revenue = totalRevenue[0]?.total || 0;

        // Estatísticas de vendas por mês (últimos 6 meses)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const monthlySales = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: sixMonthsAgo },
                    status: { $ne: 'cancelado' }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' }
                    },
                    total: { $sum: '$total' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        res.json({
            success: true,
            data: {
                stats: {
                    totalUsers,
                    totalProducts,
                    totalOrders,
                    totalRevenue: revenue,
                    pendingOrders,
                    unreadMessages
                },
                recentOrders,
                topProducts,
                monthlySales
            }
        });

    } catch (error) {
        console.error('Erro ao buscar dados do dashboard:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Gerenciar usuários
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            search, 
            type,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        const filters = {};
        
        if (search) {
            filters.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { cpf: { $regex: search, $options: 'i' } }
            ];
        }

        if (type && type !== 'all') {
            filters.type = type;
        }

        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [users, total] = await Promise.all([
            User.find(filters)
                .sort(sortOptions)
                .skip(skip)
                .limit(parseInt(limit))
                .select('-password')
                .lean(),
            User.countDocuments(filters)
        ]);

        res.json({
            success: true,
            data: {
                users,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }
        });

    } catch (error) {
        console.error('Erro ao buscar usuários:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Atualizar usuário
router.put('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Remover campos sensíveis que não devem ser atualizados diretamente
        delete updateData.password;
        delete updateData._id;

        const user = await User.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Usuário atualizado com sucesso',
            data: { user }
        });

    } catch (error) {
        console.error('Erro ao atualizar usuário:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Desativar/ativar usuário
router.patch('/users/:id/toggle-status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }

        user.isActive = !user.isActive;
        await user.save();

        res.json({
            success: true,
            message: `Usuário ${user.isActive ? 'ativado' : 'desativado'} com sucesso`,
            data: { user: user.toJSON() }
        });

    } catch (error) {
        console.error('Erro ao alterar status do usuário:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Relatório de vendas
router.get('/reports/sales', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { startDate, endDate, groupBy = 'day' } = req.query;

        const matchStage = {
            status: { $ne: 'cancelado' }
        };

        if (startDate || endDate) {
            matchStage.createdAt = {};
            if (startDate) matchStage.createdAt.$gte = new Date(startDate);
            if (endDate) matchStage.createdAt.$lte = new Date(endDate);
        }

        let groupStage;
        switch (groupBy) {
            case 'month':
                groupStage = {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' }
                    }
                };
                break;
            case 'week':
                groupStage = {
                    _id: {
                        year: { $year: '$createdAt' },
                        week: { $week: '$createdAt' }
                    }
                };
                break;
            default: // day
                groupStage = {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' },
                        day: { $dayOfMonth: '$createdAt' }
                    }
                };
        }

        const salesReport = await Order.aggregate([
            { $match: matchStage },
            {
                $group: {
                    ...groupStage,
                    totalRevenue: { $sum: '$total' },
                    totalOrders: { $sum: 1 },
                    averageOrderValue: { $avg: '$total' }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
        ]);

        // Produtos mais vendidos no período
        const topProducts = await Order.aggregate([
            { $match: matchStage },
            { $unwind: '$items' },
            {
                $group: {
                    _id: '$items.product',
                    totalQuantity: { $sum: '$items.quantity' },
                    totalRevenue: { $sum: '$items.totalPrice' },
                    productName: { $first: '$items.productName' }
                }
            },
            { $sort: { totalQuantity: -1 } },
            { $limit: 10 }
        ]);

        res.json({
            success: true,
            data: {
                salesReport,
                topProducts
            }
        });

    } catch (error) {
        console.error('Erro ao gerar relatório de vendas:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Gerenciar produtos (Admin)
router.get('/products', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search,
            category,
            isActive,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        const filters = {};

        if (search) {
            filters.$text = { $search: search };
        }

        if (category && category !== 'all') {
            filters.category = category;
        }

        if (isActive !== undefined) {
            filters.isActive = isActive === 'true';
        }

        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [products, total] = await Promise.all([
            Product.find(filters)
                .sort(sortOptions)
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Product.countDocuments(filters)
        ]);

        res.json({
            success: true,
            data: {
                products,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }
        });

    } catch (error) {
        console.error('Erro ao buscar produtos (admin):', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Conversas do chat (Admin)
router.get('/chat/conversations', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 20, search } = req.query;

        const matchStage = {
            isDeleted: false
        };

        if (search) {
            matchStage.$or = [
                { 'senderInfo.name': { $regex: search, $options: 'i' } },
                { content: { $regex: search, $options: 'i' } }
            ];
        }

        const conversations = await Message.aggregate([
            { $match: matchStage },
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: '$conversation',
                    lastMessage: { $first: '$$ROOT' },
                    messageCount: { $sum: 1 },
                    unreadCount: {
                        $sum: {
                            $cond: [
                                { $ne: ['$status', 'read'] },
                                1,
                                0
                            ]
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'lastMessage.sender',
                    foreignField: '_id',
                    as: 'senderInfo'
                }
            },
            { $sort: { 'lastMessage.createdAt': -1 } },
            { $skip: (parseInt(page) - 1) * parseInt(limit) },
            { $limit: parseInt(limit) }
        ]);

        const total = await Message.distinct('conversation', matchStage).then(arr => arr.length);

        res.json({
            success: true,
            data: {
                conversations,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }
        });

    } catch (error) {
        console.error('Erro ao buscar conversas (admin):', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Estatísticas rápidas
router.get('/quick-stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [
            todayOrders,
            todayRevenue,
            pendingOrders,
            lowStockProducts,
            unreadMessages
        ] = await Promise.all([
            Order.countDocuments({
                createdAt: { $gte: today },
                status: { $ne: 'cancelado' }
            }),
            Order.aggregate([
                {
                    $match: {
                        createdAt: { $gte: today },
                        status: { $ne: 'cancelado' }
                    }
                },
                { $group: { _id: null, total: { $sum: '$total' } } }
            ]),
            Order.countDocuments({ status: 'pendente' }),
            Product.countDocuments({ stock: { $lt: 10 }, isActive: true }),
            Message.countDocuments({ status: { $ne: 'read' } })
        ]);

        res.json({
            success: true,
            data: {
                todayOrders,
                todayRevenue: todayRevenue[0]?.total || 0,
                pendingOrders,
                lowStockProducts,
                unreadMessages
            }
        });

    } catch (error) {
        console.error('Erro ao buscar estatísticas rápidas:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

module.exports = router;

