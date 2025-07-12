const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Product = require('../models/Product');

const MONGODB_URI = 'mongodb+srv://joaovitormagnagovialli:A7YXV8vHYhjid55G@gorila.vanwqbp.mongodb.net/loja-vialli?retryWrites=true&w=majority&appName=Gorila';

async function setupDatabase() {
    try {
        console.log('Conectando ao MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Conectado ao MongoDB');

        // Criar usuário admin
        console.log('Criando usuário administrador...');
        const adminExists = await User.findOne({ email: 'lojaadmin@loja.app' });
        
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('password123', 10);
            const admin = new User({
                name: 'Administrador da Loja',
                email: 'lojaadmin@loja.app',
                password: hashedPassword,
                type: 'admin',
                phone: '(11) 99999-9999',
                isActive: true
            });
            
            await admin.save();
            console.log('✅ Usuário admin criado: lojaadmin@loja.app / password123');
        } else {
            console.log('ℹ️  Usuário admin já existe');
        }

        // Criar produtos de exemplo
        console.log('Criando produtos de exemplo...');
        const productCount = await Product.countDocuments();
        
        if (productCount === 0) {
            const sampleProducts = [
                {
                    name: 'Fita Isolante 3M Imperial 18mm X 20m Preta',
                    description: 'Fita isolante de alta qualidade da 3M, ideal para isolamento elétrico e vedação. Resistente à umidade e temperatura.',
                    price: 46.38,
                    category: 'eletrica',
                    stock: 50,
                    images: ['/uploads/products/fita-isolante-3m.jpg'],
                    tags: ['fita', 'isolante', '3M', 'eletrica'],
                    specifications: {
                        'Largura': '18mm',
                        'Comprimento': '20m',
                        'Cor': 'Preta',
                        'Marca': '3M'
                    },
                    isActive: true,
                    sales: 150,
                    rating: 4.8
                },
                {
                    name: 'Isoflex Fita Isolante Anti Chama 19mm x 20m',
                    description: 'Fita isolante anti-chama da Isoflex, perfeita para instalações elétricas residenciais e comerciais.',
                    price: 43.12,
                    category: 'eletrica',
                    stock: 75,
                    images: ['/uploads/products/isoflex-fita.jpg'],
                    tags: ['fita', 'isolante', 'isoflex', 'anti-chama'],
                    specifications: {
                        'Largura': '19mm',
                        'Comprimento': '20m',
                        'Cor': 'Azul',
                        'Marca': 'Isoflex'
                    },
                    isActive: true,
                    sales: 89,
                    rating: 4.6
                },
                {
                    name: 'Fita Isolante 3M Scotch 35+ 19mm X 20m Amarela',
                    description: 'Fita isolante premium da 3M Scotch, com excelente aderência e durabilidade. Ideal para uso profissional.',
                    price: 38.75,
                    category: 'eletrica',
                    stock: 30,
                    images: ['/uploads/products/scotch-35.jpg'],
                    tags: ['fita', 'isolante', '3M', 'scotch', 'amarela'],
                    specifications: {
                        'Largura': '19mm',
                        'Comprimento': '20m',
                        'Cor': 'Amarela',
                        'Marca': '3M Scotch'
                    },
                    isActive: true,
                    sales: 67,
                    rating: 4.9
                },
                {
                    name: 'Cabo Flexível 2,5mm² 100m Amarelo',
                    description: 'Cabo flexível de cobre para instalações elétricas residenciais e comerciais. Isolação em PVC.',
                    price: 189.90,
                    category: 'eletrica',
                    stock: 25,
                    images: ['/uploads/products/cabo-flexivel.jpg'],
                    tags: ['cabo', 'flexivel', 'cobre', 'eletrica'],
                    specifications: {
                        'Seção': '2,5mm²',
                        'Comprimento': '100m',
                        'Cor': 'Amarelo',
                        'Material': 'Cobre'
                    },
                    isActive: true,
                    sales: 45,
                    rating: 4.7
                },
                {
                    name: 'Disjuntor Bipolar 32A Siemens',
                    description: 'Disjuntor termomagnético bipolar de 32A da Siemens. Proteção contra sobrecarga e curto-circuito.',
                    price: 78.50,
                    category: 'eletrica',
                    stock: 40,
                    images: ['/uploads/products/disjuntor-siemens.jpg'],
                    tags: ['disjuntor', 'siemens', 'proteção', 'eletrica'],
                    specifications: {
                        'Corrente': '32A',
                        'Polos': '2',
                        'Marca': 'Siemens',
                        'Tipo': 'Termomagnético'
                    },
                    isActive: true,
                    sales: 78,
                    rating: 4.8
                },
                {
                    name: 'Lâmpada LED 12W Branco Frio Philips',
                    description: 'Lâmpada LED de alta eficiência energética da Philips. Luz branco frio, ideal para ambientes comerciais.',
                    price: 24.90,
                    category: 'iluminacao',
                    stock: 100,
                    images: ['/uploads/products/lampada-led-philips.jpg'],
                    tags: ['lampada', 'led', 'philips', 'iluminacao'],
                    specifications: {
                        'Potência': '12W',
                        'Cor': 'Branco Frio',
                        'Base': 'E27',
                        'Marca': 'Philips'
                    },
                    isActive: true,
                    sales: 234,
                    rating: 4.6
                },
                {
                    name: 'Furadeira de Impacto 1/2" 650W Bosch',
                    description: 'Furadeira de impacto profissional da Bosch com mandril de 1/2". Ideal para furos em alvenaria e metal.',
                    price: 289.90,
                    category: 'ferramentas',
                    stock: 15,
                    images: ['/uploads/products/furadeira-bosch.jpg'],
                    tags: ['furadeira', 'bosch', 'impacto', 'ferramentas'],
                    specifications: {
                        'Potência': '650W',
                        'Mandril': '1/2"',
                        'Marca': 'Bosch',
                        'Tipo': 'Impacto'
                    },
                    isActive: true,
                    sales: 23,
                    rating: 4.9
                },
                {
                    name: 'Cimento Portland CP II-E-32 50kg',
                    description: 'Cimento Portland de alta qualidade para construção civil. Ideal para concreto e argamassa.',
                    price: 32.50,
                    category: 'construcao',
                    stock: 200,
                    images: ['/uploads/products/cimento-portland.jpg'],
                    tags: ['cimento', 'portland', 'construção', 'concreto'],
                    specifications: {
                        'Peso': '50kg',
                        'Tipo': 'CP II-E-32',
                        'Uso': 'Construção Civil'
                    },
                    isActive: true,
                    sales: 156,
                    rating: 4.5
                }
            ];

            await Product.insertMany(sampleProducts);
            console.log(`✅ ${sampleProducts.length} produtos de exemplo criados`);
        } else {
            console.log('ℹ️  Produtos já existem no banco de dados');
        }

        console.log('✅ Setup concluído com sucesso!');
        console.log('\n📋 Informações importantes:');
        console.log('   Admin: lojaadmin@loja.app');
        console.log('   Senha: password123');
        console.log('   URL: http://localhost:3000');
        
    } catch (error) {
        console.error('❌ Erro no setup:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Desconectado do MongoDB');
        process.exit(0);
    }
}

setupDatabase();

