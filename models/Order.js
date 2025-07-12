const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    productName: String,
    productImage: String,
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    unitPrice: {
        type: Number,
        required: true,
        min: 0
    },
    totalPrice: {
        type: Number,
        required: true,
        min: 0
    },
    discount: {
        type: Number,
        default: 0,
        min: 0
    }
});

const orderSchema = new mongoose.Schema({
    orderNumber: {
        type: String,
        unique: true,
        required: true
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    customerInfo: {
        name: String,
        email: String,
        phone: String,
        cpf: String
    },
    items: [orderItemSchema],
    subtotal: {
        type: Number,
        required: true,
        min: 0
    },
    discount: {
        type: Number,
        default: 0,
        min: 0
    },
    shipping: {
        type: Number,
        default: 0,
        min: 0
    },
    total: {
        type: Number,
        required: true,
        min: 0
    },
    status: {
        type: String,
        enum: ['pendente', 'confirmado', 'preparando', 'enviado', 'entregue', 'cancelado'],
        default: 'pendente'
    },
    paymentStatus: {
        type: String,
        enum: ['pendente', 'pago', 'cancelado', 'estornado'],
        default: 'pendente'
    },
    paymentMethod: {
        type: String,
        enum: ['dinheiro', 'cartao', 'pix', 'boleto'],
        default: 'dinheiro'
    },
    shippingAddress: {
        street: String,
        number: String,
        complement: String,
        neighborhood: String,
        city: String,
        state: String,
        cep: String
    },
    notes: {
        type: String,
        default: ''
    },
    estimatedDelivery: Date,
    deliveredAt: Date,
    canceledAt: Date,
    cancelReason: String
}, {
    timestamps: true
});

// Gerar número do pedido automaticamente
orderSchema.pre('save', async function(next) {
    if (!this.orderNumber) {
        const count = await mongoose.model('Order').countDocuments();
        this.orderNumber = `PED${String(count + 1).padStart(6, '0')}`;
    }
    next();
});

module.exports = mongoose.model('Order', orderSchema);

