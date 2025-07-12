const express = require('express');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Obter carrinho do usuário
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user._id;

        let cart = await Cart.findOne({ user: userId })
            .populate('items.product', 'name price images stock isActive');

        if (!cart) {
            cart = new Cart({ user: userId, items: [] });
            await cart.save();
        }

        // Filtrar produtos inativos e calcular totais
        const activeItems = cart.items.filter(item => 
            item.product && item.product.isActive
        );

        let totalPrice = 0;
        let totalItems = 0;

        const itemsWithTotals = activeItems.map(item => {
            const itemTotal = item.product.price * item.quantity;
            totalPrice += itemTotal;
            totalItems += item.quantity;

            return {
                _id: item._id,
                product: item.product,
                quantity: item.quantity,
                itemTotal,
                addedAt: item.addedAt
            };
        });

        // Atualizar totais no carrinho se necessário
        if (cart.totalPrice !== totalPrice || cart.totalItems !== totalItems) {
            cart.totalPrice = totalPrice;
            cart.totalItems = totalItems;
            cart.items = activeItems;
            await cart.save();
        }

        res.json({
            success: true,
            data: {
                cart: {
                    _id: cart._id,
                    user: cart.user,
                    items: itemsWithTotals,
                    totalItems,
                    totalPrice,
                    lastUpdated: cart.lastUpdated
                }
            }
        });

    } catch (error) {
        console.error('Erro ao buscar carrinho:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Adicionar item ao carrinho
router.post('/add', authenticateToken, async (req, res) => {
    try {
        const { productId, quantity = 1 } = req.body;
        const userId = req.user._id;

        // Verificar se o produto existe e está ativo
        const product = await Product.findById(productId);
        if (!product || !product.isActive) {
            return res.status(404).json({
                success: false,
                message: 'Produto não encontrado ou indisponível'
            });
        }

        // Verificar estoque
        if (product.stock < quantity) {
            return res.status(400).json({
                success: false,
                message: `Estoque insuficiente. Disponível: ${product.stock}`
            });
        }

        // Buscar ou criar carrinho
        let cart = await Cart.findOne({ user: userId });
        if (!cart) {
            cart = new Cart({ user: userId, items: [] });
        }

        // Verificar se o produto já está no carrinho
        const existingItemIndex = cart.items.findIndex(
            item => item.product.toString() === productId
        );

        if (existingItemIndex > -1) {
            // Atualizar quantidade do item existente
            const newQuantity = cart.items[existingItemIndex].quantity + quantity;
            
            if (newQuantity > product.stock) {
                return res.status(400).json({
                    success: false,
                    message: `Quantidade total excede o estoque. Disponível: ${product.stock}`
                });
            }

            cart.items[existingItemIndex].quantity = newQuantity;
        } else {
            // Adicionar novo item
            cart.items.push({
                product: productId,
                quantity
            });
        }

        // Calcular totais
        cart.calculateTotals();
        await cart.save();

        // Retornar carrinho atualizado
        const updatedCart = await Cart.findById(cart._id)
            .populate('items.product', 'name price images stock');

        res.json({
            success: true,
            message: 'Item adicionado ao carrinho',
            data: { cart: updatedCart }
        });

    } catch (error) {
        console.error('Erro ao adicionar item ao carrinho:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Atualizar quantidade de item no carrinho
router.put('/update/:itemId', authenticateToken, async (req, res) => {
    try {
        const { quantity } = req.body;
        const { itemId } = req.params;
        const userId = req.user._id;

        if (quantity < 1) {
            return res.status(400).json({
                success: false,
                message: 'Quantidade deve ser maior que zero'
            });
        }

        const cart = await Cart.findOne({ user: userId });
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Carrinho não encontrado'
            });
        }

        const itemIndex = cart.items.findIndex(
            item => item._id.toString() === itemId
        );

        if (itemIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Item não encontrado no carrinho'
            });
        }

        // Verificar estoque
        const product = await Product.findById(cart.items[itemIndex].product);
        if (quantity > product.stock) {
            return res.status(400).json({
                success: false,
                message: `Estoque insuficiente. Disponível: ${product.stock}`
            });
        }

        cart.items[itemIndex].quantity = quantity;
        cart.calculateTotals();
        await cart.save();

        const updatedCart = await Cart.findById(cart._id)
            .populate('items.product', 'name price images stock');

        res.json({
            success: true,
            message: 'Quantidade atualizada',
            data: { cart: updatedCart }
        });

    } catch (error) {
        console.error('Erro ao atualizar item do carrinho:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Remover item do carrinho
router.delete('/remove/:itemId', authenticateToken, async (req, res) => {
    try {
        const { itemId } = req.params;
        const userId = req.user._id;

        const cart = await Cart.findOne({ user: userId });
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Carrinho não encontrado'
            });
        }

        cart.items = cart.items.filter(
            item => item._id.toString() !== itemId
        );

        cart.calculateTotals();
        await cart.save();

        const updatedCart = await Cart.findById(cart._id)
            .populate('items.product', 'name price images stock');

        res.json({
            success: true,
            message: 'Item removido do carrinho',
            data: { cart: updatedCart }
        });

    } catch (error) {
        console.error('Erro ao remover item do carrinho:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Limpar carrinho
router.delete('/clear', authenticateToken, async (req, res) => {
    try {
        const userId = req.user._id;

        await Cart.findOneAndUpdate(
            { user: userId },
            { 
                items: [], 
                totalItems: 0, 
                totalPrice: 0,
                lastUpdated: new Date()
            }
        );

        res.json({
            success: true,
            message: 'Carrinho limpo com sucesso'
        });

    } catch (error) {
        console.error('Erro ao limpar carrinho:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

module.exports = router;

