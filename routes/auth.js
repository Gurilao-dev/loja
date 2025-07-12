const express = require('express');
const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const router = express.Router();

// Registro de usuário
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, phone, cpf, cep, type } = req.body;

        // Verificar se o usuário já existe
        const existingUser = await User.findOne({ 
            $or: [{ email }, { cpf }] 
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Usuário já existe com este email ou CPF'
            });
        }

        // Criar novo usuário
        const user = new User({
            name,
            email,
            password,
            phone,
            cpf,
            cep,
            type: type || 'cliente'
        });

        await user.save();

        // Gerar token
        const token = generateToken(user._id);

        res.status(201).json({
            success: true,
            message: 'Usuário criado com sucesso',
            data: {
                user: user.toJSON(),
                token
            }
        });

    } catch (error) {
        console.error('Erro no registro:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Login de usuário
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Verificar se o usuário existe
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Email ou senha incorretos'
            });
        }

        // Verificar senha
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Email ou senha incorretos'
            });
        }

        // Verificar se o usuário está ativo
        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Conta desativada. Entre em contato com o suporte.'
            });
        }

        // Gerar token
        const token = generateToken(user._id);

        res.json({
            success: true,
            message: 'Login realizado com sucesso',
            data: {
                user: user.toJSON(),
                token
            }
        });

    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Verificar token
router.get('/verify', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Token não fornecido'
            });
        }

        const jwt = require('jsonwebtoken');
        const { JWT_SECRET } = require('../middleware/auth');
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);

        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Token inválido ou usuário inativo'
            });
        }

        res.json({
            success: true,
            data: {
                user: user.toJSON(),
                token
            }
        });

    } catch (error) {
        res.status(401).json({
            success: false,
            message: 'Token inválido'
        });
    }
});

module.exports = router;

