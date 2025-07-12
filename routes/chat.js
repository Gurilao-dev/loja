const express = require('express');
const Message = require('../models/Message');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Obter conversas do usuário
router.get('/conversations', authenticateToken, async (req, res) => {
    try {
        const userId = req.user._id;
        
        // Buscar conversas onde o usuário é remetente ou destinatário
        const conversations = await Message.aggregate([
            {
                $match: {
                    $or: [
                        { sender: userId },
                        { recipient: userId }
                    ],
                    isDeleted: false
                }
            },
            {
                $sort: { createdAt: -1 }
            },
            {
                $group: {
                    _id: '$conversation',
                    lastMessage: { $first: '$$ROOT' },
                    unreadCount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ['$recipient', userId] },
                                        { $ne: ['$status', 'read'] }
                                    ]
                                },
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
            {
                $lookup: {
                    from: 'users',
                    localField: 'lastMessage.recipient',
                    foreignField: '_id',
                    as: 'recipientInfo'
                }
            },
            {
                $sort: { 'lastMessage.createdAt': -1 }
            }
        ]);

        res.json({
            success: true,
            data: { conversations }
        });

    } catch (error) {
        console.error('Erro ao buscar conversas:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Obter mensagens de uma conversa
router.get('/messages/:conversationId', authenticateToken, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { page = 1, limit = 50 } = req.query;
        const userId = req.user._id;

        // Verificar se o usuário tem acesso à conversa
        const hasAccess = conversationId.includes(userId.toString()) || 
                         req.user.type === 'admin';

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: 'Acesso negado a esta conversa'
            });
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [messages, total] = await Promise.all([
            Message.find({
                conversation: conversationId,
                isDeleted: false
            })
            .populate('sender', 'name type')
            .populate('recipient', 'name type')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean(),
            Message.countDocuments({
                conversation: conversationId,
                isDeleted: false
            })
        ]);

        // Marcar mensagens como lidas
        await Message.updateMany(
            {
                conversation: conversationId,
                recipient: userId,
                status: { $ne: 'read' }
            },
            {
                status: 'read',
                readAt: new Date()
            }
        );

        res.json({
            success: true,
            data: {
                messages: messages.reverse(), // Reverter para ordem cronológica
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }
        });

    } catch (error) {
        console.error('Erro ao buscar mensagens:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Enviar mensagem
router.post('/messages', authenticateToken, async (req, res) => {
    try {
        const { recipientId, content, type = 'text', conversationId } = req.body;
        const senderId = req.user._id;

        // Verificar se o destinatário existe
        const recipient = await User.findById(recipientId);
        if (!recipient) {
            return res.status(404).json({
                success: false,
                message: 'Destinatário não encontrado'
            });
        }

        // Gerar ID da conversa se não fornecido
        const finalConversationId = conversationId || 
            [senderId, recipientId].sort().join('_');

        // Criar mensagem
        const message = new Message({
            conversation: finalConversationId,
            sender: senderId,
            senderInfo: {
                name: req.user.name,
                type: req.user.type
            },
            recipient: recipientId,
            content,
            type,
            status: 'sent'
        });

        await message.save();

        // Popular dados do remetente
        await message.populate('sender', 'name type');

        res.status(201).json({
            success: true,
            message: 'Mensagem enviada com sucesso',
            data: { message }
        });

    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Marcar mensagem como lida
router.patch('/messages/:messageId/read', authenticateToken, async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user._id;

        const message = await Message.findOneAndUpdate(
            {
                _id: messageId,
                recipient: userId
            },
            {
                status: 'read',
                readAt: new Date()
            },
            { new: true }
        );

        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Mensagem não encontrada'
            });
        }

        res.json({
            success: true,
            message: 'Mensagem marcada como lida',
            data: { message }
        });

    } catch (error) {
        console.error('Erro ao marcar mensagem como lida:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Deletar mensagem
router.delete('/messages/:messageId', authenticateToken, async (req, res) => {
    try {
        const { messageId } = req.params;
        const { deleteType = 'for_me' } = req.body; // 'for_me' ou 'for_everyone'
        const userId = req.user._id;

        const message = await Message.findById(messageId);
        
        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Mensagem não encontrada'
            });
        }

        // Verificar permissões
        const canDelete = message.sender.toString() === userId.toString() ||
                         message.recipient.toString() === userId.toString();

        if (!canDelete) {
            return res.status(403).json({
                success: false,
                message: 'Sem permissão para deletar esta mensagem'
            });
        }

        if (deleteType === 'for_everyone') {
            // Apenas o remetente pode deletar para todos
            if (message.sender.toString() !== userId.toString()) {
                return res.status(403).json({
                    success: false,
                    message: 'Apenas o remetente pode deletar para todos'
                });
            }

            // Deletar para todos
            message.isDeleted = true;
            message.deletedBy.push({
                user: userId,
                deletedAt: new Date(),
                deleteType: 'for_everyone'
            });
        } else {
            // Deletar apenas para o usuário atual
            message.deletedBy.push({
                user: userId,
                deletedAt: new Date(),
                deleteType: 'for_me'
            });
        }

        await message.save();

        res.json({
            success: true,
            message: 'Mensagem deletada com sucesso'
        });

    } catch (error) {
        console.error('Erro ao deletar mensagem:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Buscar mensagens
router.get('/search', authenticateToken, async (req, res) => {
    try {
        const { query, conversationId } = req.query;
        const userId = req.user._id;

        if (!query) {
            return res.status(400).json({
                success: false,
                message: 'Termo de busca é obrigatório'
            });
        }

        const filters = {
            $or: [
                { sender: userId },
                { recipient: userId }
            ],
            content: { $regex: query, $options: 'i' },
            isDeleted: false
        };

        if (conversationId) {
            filters.conversation = conversationId;
        }

        const messages = await Message.find(filters)
            .populate('sender', 'name type')
            .populate('recipient', 'name type')
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();

        res.json({
            success: true,
            data: { messages }
        });

    } catch (error) {
        console.error('Erro ao buscar mensagens:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Obter estatísticas do chat (Admin)
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        if (req.user.type !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Acesso negado'
            });
        }

        const stats = await Message.aggregate([
            {
                $group: {
                    _id: null,
                    totalMessages: { $sum: 1 },
                    totalConversations: { $addToSet: '$conversation' },
                    unreadMessages: {
                        $sum: {
                            $cond: [{ $ne: ['$status', 'read'] }, 1, 0]
                        }
                    }
                }
            },
            {
                $project: {
                    totalMessages: 1,
                    totalConversations: { $size: '$totalConversations' },
                    unreadMessages: 1
                }
            }
        ]);

        res.json({
            success: true,
            data: { stats: stats[0] || { totalMessages: 0, totalConversations: 0, unreadMessages: 0 } }
        });

    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

module.exports = router;

