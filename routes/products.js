const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Product = require('../models/Product');
const Review = require('../models/Review');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// Configuração do multer para upload de imagens
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '../../frontend/uploads/products');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'product-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    },
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Apenas imagens são permitidas (jpeg, jpg, png, gif, webp)'));
        }
    }
});

// Listar produtos (público)
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search,
            category,
            minPrice,
            maxPrice,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        const filters = { isActive: true };

        // Filtro de busca
        if (search) {
            filters.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { tags: { $in: [new RegExp(search, 'i')] } }
            ];
        }

        // Filtro de categoria
        if (category && category !== 'all') {
            filters.category = category;
        }

        // Filtro de preço
        if (minPrice || maxPrice) {
            filters.price = {};
            if (minPrice) filters.price.$gte = parseFloat(minPrice);
            if (maxPrice) filters.price.$lte = parseFloat(maxPrice);
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

        // Buscar avaliações para cada produto
        const productsWithReviews = await Promise.all(
            products.map(async (product) => {
                const reviews = await Review.find({ product: product._id })
                    .populate('user', 'name')
                    .sort({ createdAt: -1 })
                    .limit(5)
                    .lean();

                const avgRating = await Review.aggregate([
                    { $match: { product: product._id } },
                    { $group: { _id: null, avg: { $avg: '$rating' } } }
                ]);

                return {
                    ...product,
                    rating: avgRating[0]?.avg || 0,
                    reviewCount: reviews.length,
                    reviews: reviews
                };
            })
        );

        res.json({
            success: true,
            data: {
                products: productsWithReviews,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }
        });

    } catch (error) {
        console.error('Erro ao buscar produtos:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Obter produto por ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const product = await Product.findById(id).lean();
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Produto não encontrado'
            });
        }

        // Buscar avaliações do produto
        const reviews = await Review.find({ product: id })
            .populate('user', 'name')
            .sort({ createdAt: -1 })
            .lean();

        const avgRating = await Review.aggregate([
            { $match: { product: product._id } },
            { $group: { _id: null, avg: { $avg: '$rating' } } }
        ]);

        const productWithReviews = {
            ...product,
            rating: avgRating[0]?.avg || 0,
            reviewCount: reviews.length,
            reviews: reviews
        };

        res.json({
            success: true,
            data: { product: productWithReviews }
        });

    } catch (error) {
        console.error('Erro ao buscar produto:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Criar produto (Admin)
router.post('/', authenticateToken, requireAdmin, upload.array('images', 5), async (req, res) => {
    try {
        const {
            name,
            description,
            price,
            category,
            stock,
            tags,
            specifications
        } = req.body;

        // Processar imagens enviadas
        const images = req.files ? req.files.map(file => `/uploads/products/${file.filename}`) : [];

        // Processar tags (se enviado como string)
        let parsedTags = [];
        if (tags) {
            parsedTags = typeof tags === 'string' ? tags.split(',').map(tag => tag.trim()) : tags;
        }

        // Processar especificações (se enviado como string JSON)
        let parsedSpecs = {};
        if (specifications) {
            parsedSpecs = typeof specifications === 'string' ? JSON.parse(specifications) : specifications;
        }

        const product = new Product({
            name,
            description,
            price: parseFloat(price),
            category,
            stock: parseInt(stock),
            images,
            tags: parsedTags,
            specifications: parsedSpecs,
            isActive: true
        });

        await product.save();

        res.status(201).json({
            success: true,
            message: 'Produto criado com sucesso',
            data: { product }
        });

    } catch (error) {
        console.error('Erro ao criar produto:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Atualizar produto (Admin)
router.put('/:id', authenticateToken, requireAdmin, upload.array('images', 5), async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            description,
            price,
            category,
            stock,
            tags,
            specifications,
            existingImages
        } = req.body;

        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Produto não encontrado'
            });
        }

        // Processar novas imagens
        const newImages = req.files ? req.files.map(file => `/uploads/products/${file.filename}`) : [];
        
        // Manter imagens existentes se especificado
        let finalImages = [];
        if (existingImages) {
            const existing = typeof existingImages === 'string' ? JSON.parse(existingImages) : existingImages;
            finalImages = Array.isArray(existing) ? existing : [];
        }
        finalImages = [...finalImages, ...newImages];

        // Processar tags
        let parsedTags = [];
        if (tags) {
            parsedTags = typeof tags === 'string' ? tags.split(',').map(tag => tag.trim()) : tags;
        }

        // Processar especificações
        let parsedSpecs = {};
        if (specifications) {
            parsedSpecs = typeof specifications === 'string' ? JSON.parse(specifications) : specifications;
        }

        // Atualizar produto
        const updateData = {
            name: name || product.name,
            description: description || product.description,
            price: price ? parseFloat(price) : product.price,
            category: category || product.category,
            stock: stock !== undefined ? parseInt(stock) : product.stock,
            images: finalImages.length > 0 ? finalImages : product.images,
            tags: parsedTags.length > 0 ? parsedTags : product.tags,
            specifications: Object.keys(parsedSpecs).length > 0 ? parsedSpecs : product.specifications
        };

        const updatedProduct = await Product.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        res.json({
            success: true,
            message: 'Produto atualizado com sucesso',
            data: { product: updatedProduct }
        });

    } catch (error) {
        console.error('Erro ao atualizar produto:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Deletar produto (Admin)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Produto não encontrado'
            });
        }

        // Remover imagens do sistema de arquivos
        product.images.forEach(imagePath => {
            const fullPath = path.join(__dirname, '../../frontend', imagePath);
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }
        });

        // Remover produto e suas avaliações
        await Promise.all([
            Product.findByIdAndDelete(id),
            Review.deleteMany({ product: id })
        ]);

        res.json({
            success: true,
            message: 'Produto removido com sucesso'
        });

    } catch (error) {
        console.error('Erro ao remover produto:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Ativar/Desativar produto (Admin)
router.patch('/:id/toggle-status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Produto não encontrado'
            });
        }

        product.isActive = !product.isActive;
        await product.save();

        res.json({
            success: true,
            message: `Produto ${product.isActive ? 'ativado' : 'desativado'} com sucesso`,
            data: { product }
        });

    } catch (error) {
        console.error('Erro ao alterar status do produto:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Adicionar avaliação
router.post('/:id/reviews', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { rating, comment } = req.body;
        const userId = req.user._id;

        // Verificar se o produto existe
        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Produto não encontrado'
            });
        }

        // Verificar se o usuário já avaliou este produto
        const existingReview = await Review.findOne({
            product: id,
            user: userId
        });

        if (existingReview) {
            return res.status(400).json({
                success: false,
                message: 'Você já avaliou este produto'
            });
        }

        // Criar nova avaliação
        const review = new Review({
            product: id,
            user: userId,
            rating: parseInt(rating),
            comment
        });

        await review.save();
        await review.populate('user', 'name');

        res.status(201).json({
            success: true,
            message: 'Avaliação adicionada com sucesso',
            data: { review }
        });

    } catch (error) {
        console.error('Erro ao adicionar avaliação:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Obter categorias disponíveis
router.get('/meta/categories', async (req, res) => {
    try {
        const categories = await Product.distinct('category', { isActive: true });
        
        res.json({
            success: true,
            data: { categories }
        });

    } catch (error) {
        console.error('Erro ao buscar categorias:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

module.exports = router;

