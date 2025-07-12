const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://joaovitormagnagovialli:A7YXV8vHYhjid55G@gorila.vanwqbp.mongodb.net/loja-vialli?retryWrites=true&w=majority&appName=Gorila';

const connectDB = async () => {
    try {
        console.log('Tentando conectar ao MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ MongoDB conectado com sucesso');
    } catch (error) {
        console.error('❌ Erro ao conectar com MongoDB:', error.message);
        
        // Em desenvolvimento, continuar sem banco para permitir testes da interface
        if (process.env.NODE_ENV !== 'production') {
            console.log('⚠️  Modo desenvolvimento: continuando sem banco de dados');
            console.log('   A interface funcionará, mas os dados não serão salvos');
        } else {
            process.exit(1);
        }
    }
};

module.exports = connectDB;

